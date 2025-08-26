// src/Pages/Dashboard/dashboard.jsx
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import Sidebar from "../../Components/Sidebar";
import NoticeModal from "../../Components/NoticeModal";
import UploadButton from "../../Components/UploadButton";
import ImageCard from "../../Components/ImageCard";
import Controls from "../../Components/Controls";
import DeleteModal from "../../Components/DeleteModal";
import ImageViewerModal from "../../Components/ImageViewerModal";

import ModeSelector from "../../Components/ModeSelector";
import ProgressBar from "../../Components/ProgressBar";
import TimelineStrip from "../../Components/TimelineStrip";
import NoiseChart from "../../Components/NoiseChart";

import useImageHistory from "../../hooks/useImageHistory";
import usePerImageTimeline from "../../hooks/usePerImageTimeline";
import useDiffusionStream from "../../hooks/useDiffusionStream";

import { api } from "../../services/api";
import { getCurrentUsername } from "../../utils/user";
import { toUiImage, fileToDataURL, clamp } from "../../utils/image";

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const preloaded = location.state?.image;
  const [invalidFileOpen, setInvalidFileOpen] = useState(false);
  const [invalidFileMsg, setInvalidFileMsg] = useState("");

  // Sidebar / auth
  const [collapsed, setCollapsed] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState(null);
  const [viewerImage, setViewerImage] = useState(null);
  const [username, setUsername] = useState("");

  // Active image
  const [uploadedImage, setUploadedImage] = useState(null); // preview URL (object/data)
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState(null); // base64 data URL
  const [currentImageKey, setCurrentImageKey] = useState(null);

  // Diffusion config + view state
  const [diffusedImage, setDiffusedImage] = useState(null);
  const [diffusion, setDiffusion] = useState({
    steps: 500,
    betaMin: "",
    betaMax: "",
    schedule: "linear",
  });
  const [mode, setMode] = useState("slow");

  // Stream state
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [streamError, setStreamError] = useState("");

  // timeline & chart (custom hook)
  const {
    frames, setFrames, scrubT, setScrubT,
    tOffsetRef, timelineRef, timelineScrollRef,
    saveFramesForImage, loadFramesForImage, rememberScroll, restoreScroll, computeNextOffsetFrom,
  } = usePerImageTimeline();

  // websocket + rest (custom hook)
  const { fastDiffuse, slowDiffuse, cancel: cancelStream, wsRef } = useDiffusionStream({ api });

  const chartPoints = useMemo(
    () =>
      frames
        .map((f) => {
          const c = f?.metrics?.Cosine;
          return typeof c === "number" && isFinite(c)
            ? { x: f.globalT, residual: 1 - c }
            : null;
        })
        .filter(Boolean),
    [frames]
  );

  const { history, setHistory, refreshHistory } = useImageHistory();
  const canDiffuse = Boolean(uploadedImageDataUrl);

  // Username
  useEffect(() => {
    (async () => setUsername((await getCurrentUsername()) || ""))();
  }, []);

  // Preload via router
  useEffect(() => {
    if (!preloaded) return;
    const key = preloaded.id || `preloaded:${preloaded.url?.slice(0, 64)}`;
    switchToImage(key, preloaded.url, preloaded.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloaded]);

  // ensure WS closed on unmount
  useEffect(
    () => () => {
      try {
        wsRef.current?.close();
      } catch {}
    },
    [wsRef]
  );

  // Update preview when scrubbing
  useEffect(() => {
    if (scrubT == null) return;
    const f = frames.find((x) => x.globalT === scrubT);
    if (f?.image) setDiffusedImage(f.image);
    if (typeof f?.localT === "number") setCurrentStep(f.localT);
  }, [scrubT, frames]);

  const clearUiTimeline = useCallback(() => {
    setFrames([]);
    setScrubT(null);
    setProgress(0);
    setCurrentStep(0);
    tOffsetRef.current = 0;
    setDiffusedImage(null);
  }, [setFrames, setScrubT, tOffsetRef]);

  const switchToImage = useCallback(
    (key, imageUrl, dataUrl) => {
      // 1) stop any existing stream
      try {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: "cancel" }));
          wsRef.current.close();
        }
      } catch {}
      setIsStreaming(false);
      setStreamError("");

      // 2) persist old frames
      if (currentImageKey) saveFramesForImage(currentImageKey, frames);

      // 3) update active image
      setCurrentImageKey(key || null);
      setUploadedImage(imageUrl || null);
      setUploadedImageDataUrl(dataUrl || null);

      // 4) restore frames
      const restored = key ? loadFramesForImage(key) : [];
      setFrames(restored);
      setScrubT(null);
      setProgress(0);
      setCurrentStep(0);
      tOffsetRef.current = computeNextOffsetFrom(restored);

      // 5) restore preview
      if (restored.length) {
        const last = restored[restored.length - 1];
        if (last?.image) setDiffusedImage(last.image);
      } else {
        setDiffusedImage(null);
      }
    },
    [
      wsRef,
      currentImageKey,
      frames,
      saveFramesForImage,
      loadFramesForImage,
      setFrames,
      setScrubT,
      computeNextOffsetFrom,
      tOffsetRef,
    ]
  );

const handleUpload = useCallback(
  async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setInvalidFileMsg("Please upload a valid image file (JPG, PNG, WEBP, etc.).");
      setInvalidFileOpen(true);
      return;
    }

    if (currentImageKey) saveFramesForImage(currentImageKey, frames);
    const objectUrl = URL.createObjectURL(file);
    const dataUrl = await fileToDataURL(file);

    // switch immediately (no key yet)
    switchToImage(null, objectUrl, dataUrl);

    try {
      const item = await api.uploadImage(file);
      const uiItem = toUiImage(item);
      setHistory((prev) => [uiItem, ...prev]);
      // now we have a stable id: re-switch
      switchToImage(uiItem.id, uiItem.url, uiItem.url);
    } catch (err) {
      console.error(err);
      // keep temp image with null key
    } finally {
      // cleanup object URL (not the dataUrl)
      URL.revokeObjectURL(objectUrl);
    }
  },
  [api, currentImageKey, frames, saveFramesForImage, setHistory, switchToImage]
);


  const handleSelectFromSidebar = useCallback(
    (item) => {
      const ui = toUiImage(item);
      switchToImage(ui.id, ui.url, ui.url);
    },
    [switchToImage]
  );

  const confirmDelete = useCallback(async () => {
    if (!selectedForDelete) return;
    try {
      if (currentImageKey === selectedForDelete.id) {
        try {
          sessionStorage.removeItem(`frames:${currentImageKey}`);
        } catch {}
        switchToImage(null, null, null);
      }
      await api.deleteImage(selectedForDelete.id);
      setHistory((h) => h.filter((x) => x.id !== selectedForDelete.id));
      await refreshHistory();
    } catch (e) {
      console.error(e);
    } finally {
      setSelectedForDelete(null);
      setShowDeleteModal(false);
    }
  }, [api, currentImageKey, selectedForDelete, refreshHistory, setHistory, switchToImage]);

  const diffuse = useCallback(async () => {
    if (!canDiffuse) {
      alert("Please upload an image first.");
      return;
    }
    if (mode === "fast") {
      setProgress(0);
      setStreamError("");
      setIsStreaming(false);
      await fastDiffuse({
        uploadedImageDataUrl,
        diffusion,
        setDiffusedImage,
        setProgress,
        setCurrentStep,
      });
    } else {
      // SLOW (WS)
      setStreamError("");
      setIsStreaming(true);
      setProgress(0);

      // append new run after last globalT for THIS IMAGE
      const nextOffset = computeNextOffsetFrom(frames);
      tOffsetRef.current = nextOffset; // ✅ do NOT reset to 0

      slowDiffuse({
        uploadedImageDataUrl,
        diffusion,
        tOffset: nextOffset,
        onStart: () => {},
        onFrame: (frame) => {
          if (!frame.image) return;
          setFrames((prev) => {
            const idx = prev.findIndex((f) => f.globalT === frame.globalT);
            let next;
            if (idx >= 0) {
              next = [...prev];
              next[idx] = frame;
            } else {
              next = [...prev, frame].sort((a, b) => a.globalT - b.globalT);
            }
            if (currentImageKey) {
              try {
                sessionStorage.setItem(
                  `frames:${currentImageKey}`,
                  JSON.stringify(next)
                );
              } catch {}
            }
            return next;
          });
          // live preview when not scrubbing
          if (scrubT == null && frame.image) setDiffusedImage(frame.image);
        },
        onProgress: (p, t) => {
          setProgress(p);
          setCurrentStep(t);
        },
        onDone: () => {
          setIsStreaming(false);
          setProgress(1);
        },
        onError: (err) => {
          setIsStreaming(false);
          setStreamError(err?.message || "WebSocket error");
        },
      });
    }
  }, [
    mode,
    canDiffuse,
    fastDiffuse,
    slowDiffuse,
    uploadedImageDataUrl,
    diffusion,
    setDiffusedImage,
    setProgress,
    setCurrentStep,
    computeNextOffsetFrom,
    frames,
    tOffsetRef,
    currentImageKey,
    scrubT,
  ]);

  const onCenterThumb = useCallback(
    (e) => {
      const el = timelineRef.current;
      if (!el) return;
      const crect = el.getBoundingClientRect();
      const brect = e.currentTarget.getBoundingClientRect();
      const delta =
        brect.left - (crect.left + crect.width / 2 - brect.width / 2);
      el.scrollLeft += delta;
      timelineScrollRef.current = el.scrollLeft;
    },
    [timelineRef, timelineScrollRef]
  );

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
      navigate("/login", { replace: true });
      window.location.reload();
    } catch (e) {
      console.error("Error logging out:", e);
    }
  }, [navigate]);

  // derived
  const totalSteps = clamp(Number(diffusion.steps) || 1, 1, 1000);

  return (
    <div className="min-h-screen flex bg-gray-100 text-gray-900">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        history={history}
        onSelectItem={handleSelectFromSidebar}
        onDeleteItem={(item) => {
          setSelectedForDelete(item);
          setShowDeleteModal(true);
        }}
        onSettings={() => navigate("/settings")}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold">
            Welcome {username}, Ready to explore diffusion?
          </h1>
        </header>

        <main className="flex flex-col">
          {!uploadedImage ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <label className="flex flex-col items-center justify-center w-full max-w-lg h-64 border-2 border-dashed border-gray-400 rounded-2xl cursor-pointer bg-gray-50 hover:bg-gray-100">
                <UploadButton onSelect={handleUpload} label="Choose File" />
                <p className="mt-3 text-sm text-gray-500">
                  Drag & drop an image here, or click to select
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e.target.files[0])}
                  className="hidden"
                />
              </label>
              <button
                onClick={refreshHistory}
                className="mt-6 text-sm text-gray-600 underline hover:no-underline"
              >
                Refresh history
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
                <ImageCard title="Original Image" src={uploadedImage} />
                <ImageCard
                  title={
                    mode === "slow"
                      ? `Diffused Image ${isStreaming ? "(streaming…)" : ""}`
                      : "Diffused Image"
                  }
                  src={diffusedImage}
                  placeholder="Click Diffuse to generate image"
                />
              </div>

              <div className="bg-white border-t p-6">
                <div className="w-full flex flex-wrap items-center justify-center gap-6">
                  <UploadButton onSelect={handleUpload} label="Upload Another Image" compact />
                  <ModeSelector value={mode} onChange={setMode} />
                  <Controls
                    diffusion={diffusion}
                    setDiffusion={setDiffusion}
                    onDiffuse={diffuse}
                  />
                  {mode === "slow" && isStreaming && (
                    <button
                      onClick={cancelStream}
                      className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {(isStreaming || progress > 0) && (
                  <ProgressBar
                    isStreaming={isStreaming}
                    progress={progress}
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    streamError={streamError}
                  />
                )}
              </div>

              {mode === "slow" && (isStreaming || frames.length > 0) && (
                <section className="bg-gray-50 border-t p-6 space-y-4">
                  <h2 className="text-lg font-semibold">Interactive Timeline</h2>
                  <TimelineStrip
                    frames={frames}
                    scrubT={scrubT}
                    setScrubT={setScrubT}
                    timelineRef={timelineRef}
                    rememberScroll={rememberScroll}
                    restoreScroll={restoreScroll}
                    onCenterClick={onCenterThumb}
                    onAfterSelect={() => {
                      // Bring chart into view (vertical only)
                      document
                        .getElementById("noise-chart-anchor")
                        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }}
                  />
                  <div id="noise-chart-anchor">
                    <NoiseChart
                      chartPoints={chartPoints}
                      scrubT={scrubT}
                      setScrubT={setScrubT}
                    />
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>

      {showDeleteModal && (
        <DeleteModal
          file={selectedForDelete}
          onCancel={() => {
            setSelectedForDelete(null);
            setShowDeleteModal(false);
          }}
          onConfirm={confirmDelete}
        />
      )}
      {viewerImage && (
        <ImageViewerModal
          image={viewerImage}
          onClose={() => setViewerImage(null)}
        />
      )}
      <NoticeModal
        open={invalidFileOpen}
        title="Invalid file type"
        message={invalidFileMsg}
        onClose={() => setInvalidFileOpen(false)}
      />

    </div>
  );
}
