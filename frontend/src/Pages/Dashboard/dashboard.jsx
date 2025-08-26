// src/Pages/Dashboard/dashboard.jsx
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import Sidebar from "../../Components/Sidebar";
import NoticeModal from "../../Components/NoticeModal";
import UploadButton from "../../Components/UploadButton";
import ImageCard from "../../Components/ImageCard";
import BetaChart from "../../Components/BetaChart";
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
  saveFramesForImage, loadFramesForImage, deleteFramesForImage, 
  rememberScroll, restoreScroll, computeNextOffsetFrom,
} = usePerImageTimeline();


  // websocket + rest (custom hook)
  const { fastDiffuse, slowDiffuse, cancel: cancelStream, wsRef } = useDiffusionStream({ api });

const chartPoints = useMemo(
  () =>
    frames
      .map((f) => {
        const c = f?.metrics?.Cosine;
        const b = f?.betas;
        return {
          x: f.globalT,
          residual: typeof c === "number" && isFinite(c) ? 1 - c : null,
          beta: typeof b === "number" && isFinite(b) ? b : null,
        };
      })
      .filter((p) => p.residual !== null || p.beta !== null),
  [frames]
);

const { history, refreshHistory, removeById, addOrUpdate } = useImageHistory();
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
  async (key, imageUrl, dataUrl) => {
    // stop existing stream...
    if (currentImageKey) await saveFramesForImage(currentImageKey, frames);

    setCurrentImageKey(key || null);
    setUploadedImage(imageUrl || null);
    setUploadedImageDataUrl(dataUrl || null);

    const restored = key ? await loadFramesForImage(key) : [];
    setFrames(restored);
    setScrubT(null);
    setProgress(0);
    setCurrentStep(0);
    tOffsetRef.current = computeNextOffsetFrom(restored);

    if (restored.length) {
      const last = restored[restored.length - 1];
      if (last?.image) setDiffusedImage(last.image);
    } else {
      setDiffusedImage(null);
    }
  },
  [currentImageKey, frames, saveFramesForImage, loadFramesForImage, computeNextOffsetFrom]
);



const handleUpload = useCallback(
  async (file) => {
    if (!file) return;

    // ✅ check file type
    if (!file.type.startsWith("image/")) {
      setInvalidFileMsg("Please upload a valid image file (JPG, PNG, WEBP, etc.)");
      setInvalidFileOpen(true);
      return;
    }

    // persist current image’s frames
    if (currentImageKey) saveFramesForImage(currentImageKey, frames);

    // temp preview
    const objectUrl = URL.createObjectURL(file);
    const dataUrl = await fileToDataURL(file);

    // switch immediately (no key yet)
    switchToImage(null, objectUrl, dataUrl);

    try {
      const item = await api.uploadImage(file);
      const uiItem = toUiImage(item);

      // ✅ add new item optimistically
      addOrUpdate(uiItem);

      // re-switch with server id
      switchToImage(uiItem.id, uiItem.url, uiItem.url);

      // optional: background refresh to sync
      refreshHistory();
    } catch (err) {
      console.error(err);
      // keep temp image with null key
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  },
  [
    api,
    currentImageKey,
    frames,
    saveFramesForImage,
    switchToImage,
    addOrUpdate,
    refreshHistory,
  ]
);



  const handleSelectFromSidebar = useCallback(
    (item) => {
      const ui = toUiImage(item);
      switchToImage(ui.id, ui.url, ui.url);
    },
    [switchToImage]
  );

  const resetTimelineForActiveImage = useCallback(async () => {
  // stop any previous stream just in case
  try {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "cancel" }));
      wsRef.current.close();
    }
  } catch {}

  // clear persisted + in-memory timeline for the active image
  if (currentImageKey) {
    await deleteFramesForImage(currentImageKey);
  }

  // clear UI state for the timeline
  setFrames([]);
  setScrubT(null);
  setProgress(0);
  setCurrentStep(0);
  setDiffusedImage(null);
  tOffsetRef.current = 0; // start from 0 next run
}, [
  currentImageKey,
  deleteFramesForImage,
  setFrames,
  setScrubT,
  setProgress,
  setCurrentStep,
  setDiffusedImage,
  tOffsetRef,
  wsRef,
]);

  const confirmDelete = useCallback(async () => {
  if (!selectedForDelete) return;
  const id = selectedForDelete.id;

if (currentImageKey === id) {
  await deleteFramesForImage(id);
  switchToImage(null, null, null);
}

  // ✅ optimistic removal
  removeById(id);

  try {
    await api.deleteImage(id);
    refreshHistory(); // background re-sync
    setUploadedImage(null)
    console.log(uploadedImage)
  } catch (e) {
    console.error("Delete failed:", e);
    // optional rollback here
  } finally {
    setSelectedForDelete(null);
    setShowDeleteModal(false);
  }
}, [selectedForDelete, currentImageKey, removeById, refreshHistory, switchToImage]);

const diffuse = useCallback(async () => {
  if (!canDiffuse) {
    setInvalidFileMsg("Please upload an image first.");
    setInvalidFileOpen(true);
    return;
  }

  if (mode === "fast") {
    // fast mode doesn’t use timeline, but we can still reset preview state if you want
    setStreamError("");
    setIsStreaming(false);
    setProgress(0);
    await fastDiffuse({
      uploadedImageDataUrl,
      diffusion,
      setDiffusedImage,
      setProgress,
      setCurrentStep,
    });
    return;
  }

  // --- SLOW (WebSocket) ---
  // ✅ clear the current image’s timeline so the new run starts fresh
  await resetTimelineForActiveImage();

  setStreamError("");
  setIsStreaming(true);
  setProgress(0);

  const nextOffset = 0;            // ✅ always start from 0 now
  tOffsetRef.current = nextOffset; // keep ref in sync

  slowDiffuse({
    uploadedImageDataUrl,
    diffusion,
    tOffset: nextOffset,
    onStart: () => {},
    onFrame: async (frame) => {
      if (!frame.image) return;

      setFrames((prev) => {
        const idx = prev.findIndex((f) => f.globalT === frame.globalT);
        const next =
          idx >= 0
            ? prev.map((p, i) => (i === idx ? frame : p))
            : [...prev, frame].sort((a, b) => a.globalT - b.globalT);

        // persist to IndexedDB each step
        if (currentImageKey) {
          saveFramesForImage(currentImageKey, next);
        }
        return next;
      });

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
}, [
  mode,
  canDiffuse,
  uploadedImageDataUrl,
  diffusion,
  fastDiffuse,
  slowDiffuse,
  resetTimelineForActiveImage, // ✅ new dep
  setDiffusedImage,
  setProgress,
  setCurrentStep,
  tOffsetRef,
  currentImageKey,
  scrubT,
  saveFramesForImage,
  setFrames,
  setStreamError,
  setIsStreaming,
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
  <div className="h-screen w-screen overflow-hidden bg-gray-100 text-gray-900">
    {/* Sidebar is fixed and full-height (self-contained inside Sidebar.jsx) */}
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

    {/* Main content pushed right by sidebar width */}
    <div
      className="flex flex-col overflow-y-auto h-screen"
      style={{ marginLeft: collapsed ? "4rem" : "16rem" }} // 64px when collapsed, 256px expanded
    >
      <header className="bg-white shadow p-4 border-b border-gray-200 sticky top-0 z-10">
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
                <Controls diffusion={diffusion} setDiffusion={setDiffusion} onDiffuse={diffuse} />
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
                    document
                      .getElementById("noise-chart-anchor")
                      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }}
                />
                <div id="noise-chart-anchor">
                  <NoiseChart chartPoints={chartPoints} scrubT={scrubT} setScrubT={setScrubT} />
                  <BetaChart chartPoints={chartPoints} scrubT={scrubT} setScrubT={setScrubT} />
                </div>
              </section>
              
            )}
          </>
        )}
      </main>
    </div>

    {/* Modals */}
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
    {viewerImage && <ImageViewerModal image={viewerImage} onClose={() => setViewerImage(null)} />}
    <NoticeModal
      open={invalidFileOpen}
      title="Invalid file type"
      message={invalidFileMsg}
      onClose={() => setInvalidFileOpen(false)}
    />
  </div>
);

}
