// src/Pages/Dashboard/dashboard.jsx
import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Sidebar from "../../Components/Sidebar";
import UploadButton from "../../Components/UploadButton";
import ImageCard from "../../Components/ImageCard";
import Controls from "../../Components/Controls";
import DeleteModal from "../../Components/DeleteModal";
import ImageViewerModal from "../../Components/ImageViewerModal";
import useImageHistory from "../../hooks/useImageHistory";
import { api } from "../../services/api";
import { getCurrentUsername } from "../../utils/user";
import { toUiImage, fileToDataURL, clamp } from "../../utils/image";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
} from "recharts";

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const preloaded = location.state?.image;

  // Sidebar / viewer / auth state
  const [collapsed, setCollapsed] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState(null);
  const [viewerImage, setViewerImage] = useState(null);
  const [username, setUsername] = useState("");

  // Image + diffusion state
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState(null);

  // 🔑 Track which image is "active" for per-image timelines
  const [currentImageKey, setCurrentImageKey] = useState(null);

  const [diffusedImage, setDiffusedImage] = useState(null);
  const [diffusion, setDiffusion] = useState({
    steps: 500,
    betaMin: "",
    betaMax: "",
    schedule: "linear",
  });

  // Fast vs Slow mode
  const [mode, setMode] = useState("slow");

  // Streaming (WS) state
  const wsRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [streamError, setStreamError] = useState("");

  // Timeline state (continuous)
  // Each frame: { localT, globalT, image, metrics }
  const [frames, setFrames] = useState([]);
  const [scrubT, setScrubT] = useState(null); // globalT
  const tOffsetRef = useRef(0); // global timeline offset per run

  // 🔒 Per-image frames cache (in-memory)
  const framesByImageRef = useRef(new Map());

  // Refs for layout/scroll behavior
  const chartContainerRef = useRef(null);
  const timelineRef = useRef(null);
  const timelineScrollRef = useRef(0); // last known scrollLeft of timeline

  // ---------- Helpers: persist/restore per-image frames ----------
  const ssKey = (k) => `frames:${k}`;
  const saveFramesForImage = (key, framesArr) => {
    if (!key) return;
    try {
      framesByImageRef.current.set(key, framesArr);
      sessionStorage.setItem(ssKey(key), JSON.stringify(framesArr));
    } catch {}
  };
  const loadFramesForImage = (key) => {
    if (!key) return [];
    const mem = framesByImageRef.current.get(key);
    if (mem) return mem;
    try {
      const raw = sessionStorage.getItem(ssKey(key));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };
  const clearUiTimeline = () => {
    setFrames([]);
    setScrubT(null);
    setProgress(0);
    setCurrentStep(0);
    tOffsetRef.current = 0;
    setDiffusedImage(null);
  };
  const switchToImage = (key, imageUrl, dataUrl) => {
    // Cancel any running stream from previous image
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "cancel" }));
        wsRef.current.close();
      }
    } catch {}
    setIsStreaming(false);
    setStreamError("");

    // Persist old frames under old key
    if (currentImageKey) {
      saveFramesForImage(currentImageKey, frames);
    }

    // Update image
    setCurrentImageKey(key || null);
    setUploadedImage(imageUrl || null);
    setUploadedImageDataUrl(dataUrl || null);

    // Restore frames for the new image
    const restored = key ? loadFramesForImage(key) : [];
    setFrames(restored);
    setScrubT(null);
    setProgress(0);
    setCurrentStep(0);
    tOffsetRef.current = restored.length
      ? restored[restored.length - 1].globalT + 1
      : 0;

    // Restore preview from last frame (if any)
    if (restored.length) {
      const last = restored[restored.length - 1];
      if (last?.image) setDiffusedImage(last.image);
    } else {
      setDiffusedImage(null);
    }
  };

  // Preserve horizontal scroll across re-renders (before paint)
  useLayoutEffect(() => {
    const el = timelineRef.current;
    if (el) el.scrollLeft = timelineScrollRef.current;
  }, [frames.length, scrubT]);

  // Build chart points (continuous via globalT)
  const chartPoints = useMemo(() => {
    return frames
      .map((f) => {
        const c = f?.metrics?.Cosine;
        if (typeof c === "number" && isFinite(c)) {
          return { x: f.globalT, residual: 1 - c };
        }
        return null;
      })
      .filter(Boolean);
  }, [frames]);

  // Point currently selected (for ReferenceDot)
  const selectedPoint = useMemo(() => {
    if (scrubT == null) return null;
    return chartPoints.find((p) => p.x === scrubT) || null;
  }, [scrubT, chartPoints]);

  // History
  const { history, setHistory, refreshHistory } = useImageHistory();
  const canDiffuse = useMemo(() => Boolean(uploadedImageDataUrl), [uploadedImageDataUrl]);

  // Username
  useEffect(() => {
    (async () => {
      const name = await getCurrentUsername();
      setUsername(name || "");
    })();
  }, []);

  // Preload image (if router gave one)
  useEffect(() => {
    if (!preloaded) return;
    // If preloaded has an id, use that as key; otherwise a stable fallback
    const key = preloaded.id || `preloaded:${preloaded.url?.slice(0, 64)}`;
    switchToImage(key, preloaded.url, preloaded.url);
  }, [preloaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup WS on unmount
  useEffect(() => {
    return () => {
      try {
        wsRef.current?.close();
      } catch {}
    };
  }, []);

  // Update preview when scrubbing (by globalT)
  useEffect(() => {
    if (scrubT == null) return;
    const f = frames.find((x) => x.globalT === scrubT);
    if (f?.image) setDiffusedImage(f.image);
    if (typeof f?.localT === "number") setCurrentStep(f.localT);
  }, [scrubT, frames]);

  // ---------------- Handlers ----------------
  const handleUpload = async (file) => {
    if (!file) return;

    // Persist current image’s frames before switching
    if (currentImageKey) saveFramesForImage(currentImageKey, frames);

    // Temporary preview while uploading
    const objectUrl = URL.createObjectURL(file);
    const dataUrl = await fileToDataURL(file);

    // Switch UI immediately (no key yet)
    switchToImage(null, objectUrl, dataUrl);

    try {
      const item = await api.uploadImage(file);
      const uiItem = toUiImage(item); // has .id, .url (data URL), etc.
      setHistory((prev) => [uiItem, ...prev]);

      // Now that we have a server id, reswitch with a real key
      switchToImage(uiItem.id, uiItem.url, uiItem.url);
    } catch (err) {
      console.error(err);
      // Keep temporary image but with null key; timeline will work but won’t persist across refresh
    }
  };

  // When clicking a file in the sidebar, make it the active working image
  const handleSelectFromSidebar = (item) => {
    const ui = toUiImage(item); // normalize if needed
    switchToImage(ui.id, ui.url, ui.url);
  };

  const openDelete = (item) => {
    setSelectedForDelete(item);
    setShowDeleteModal(true);
  };
  const closeDelete = () => {
    setSelectedForDelete(null);
    setShowDeleteModal(false);
  };

  const confirmDelete = async () => {
    if (!selectedForDelete) return;
    try {
      // If deleting the currently active image, clear its timeline too
      if (currentImageKey === selectedForDelete.id) {
        // persist last frames (optional), then clear storage
        sessionStorage.removeItem(ssKey(currentImageKey));
        framesByImageRef.current.delete(currentImageKey);
        switchToImage(null, null, null);
      }

      await api.deleteImage(selectedForDelete.id);
      setHistory((h) => h.filter((x) => x.id !== selectedForDelete.id));
      await refreshHistory();
    } catch (e) {
      console.error(e);
    } finally {
      closeDelete();
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      navigate("/login", { replace: true });
      window.location.reload();
    } catch (e) {
      console.error("Error logging out:", e);
    }
  };

  // ---------------- Diffusion ----------------
  const diffuse = async () => {
    if (!canDiffuse) {
      alert("Please upload an image first.");
      return;
    }
    if (mode === "fast") {
      await fastDiffuse();
    } else {
      await slowDiffuse();
    }
  };

  const fastDiffuse = async () => {
    const steps = clamp(Number(diffusion.steps) || 1, 1, 1000);
    clearUiTimeline();
    const payload = {
      image_b64: uploadedImageDataUrl,
      steps,
      schedule: diffusion.schedule,
      beta_start: diffusion.betaMin ? Number(diffusion.betaMin) : undefined,
      beta_end: diffusion.betaMax ? Number(diffusion.betaMax) : undefined,
      seed: 42,
      return_data_url: true,
    };
    try {
      const data = await api.diffuse(payload);
      setDiffusedImage(data.image);
      setProgress(1);
      setCurrentStep(steps - 1);
      setStreamError("");
      // fast mode is a one-shot; do not touch frames/timeline
    } catch (e) {
      console.error(e);
      alert(e.message || "Diffusion failed");
    }
  };

  const slowDiffuse = async () => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "cancel" }));
        wsRef.current.close();
      }
    } catch {}
    clearUiTimeline();

    const steps = clamp(Number(diffusion.steps) || 1, 1, 1000);
    setIsStreaming(true);
    setProgress(0);
    setStreamError("");

    // Shift new run to append after last globalT FOR THIS IMAGE
    const lastGlobalT = frames.length ? frames[frames.length - 1].globalT : -1;
    tOffsetRef.current = lastGlobalT + 1;

    tOffsetRef.current = 0;

    const BASE_HTTP = api.baseURL || "http://localhost:8000";
    const WS_URL = BASE_HTTP.replace(/^http/, "ws") + "/diffuse/ws";
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      const previewEvery = Math.max(1, Math.floor(steps / 25));
      ws.send(
        JSON.stringify({
          image_b64: uploadedImageDataUrl,
          steps,
          beta_start: diffusion.betaMin ? Number(diffusion.betaMin) : 1e-3,
          beta_end: diffusion.betaMax ? Number(diffusion.betaMax) : 2e-2,
          schedule: diffusion.schedule,
          seed: 42,
          preview_every: previewEvery,
          quality: 85,
          data_url: true,
          include_metrics: true,
        })
      );
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (typeof msg.t === "number") {
          const globalT = msg.t + tOffsetRef.current;

          if (msg.image) {
            setFrames((prev) => {
              const idx = prev.findIndex((f) => f.globalT === globalT);
              let next;
              if (idx >= 0) {
                next = [...prev];
                next[idx] = {
                  localT: msg.t,
                  globalT,
                  image: msg.image,
                  metrics: msg.metrics || null,
                };
              } else {
                next = [
                  ...prev,
                  {
                    localT: msg.t,
                    globalT,
                    image: msg.image,
                    metrics: msg.metrics || null,
                    betas: msg.beta,
                  },
                ].sort((a, b) => a.globalT - b.globalT);
              }

              // Persist per-image frames on each update
              if (currentImageKey) saveFramesForImage(currentImageKey, next);
              return next;
            });
          }

          if (scrubT == null && msg.image) {
            setDiffusedImage(msg.image);
          }

          setCurrentStep(msg.t);
          if (typeof msg.progress === "number") setProgress(msg.progress);
        }

        if (msg.status === "done") {
          setIsStreaming(false);
          setProgress(1);
          ws.close();
        }
      } catch (e) {
        console.error("WS parse error:", e);
      }
    };

    ws.onerror = () => {
      setIsStreaming(false);
      setStreamError("WebSocket error");
    };
    ws.onclose = () => setIsStreaming(false);
  };

  const cancelStream = () => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "cancel" }));
        wsRef.current.close();
      }
    } catch {}
  };

  // ---------------- UI Components ----------------
  const ModeSelector = () => (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-gray-700">Mode</label>
      <select
        className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        <option value="fast">Fast diffusion (REST)</option>
        <option value="slow">Slow diffusion (WebSocket)</option>
      </select>
    </div>
  );

  const ProgressBar = () => (
    <div className="w-full max-w-xl mx-auto mt-4">
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full bg-gray-900 transition-all"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-gray-600 text-center">
        {isStreaming
          ? `Streaming… step ${currentStep} / ${diffusion.steps - 1}`
          : progress === 1
          ? "Done"
          : ""}
      </div>
      {streamError && <div className="mt-2 text-xs text-red-600">{streamError}</div>}
    </div>
  );

  const TimelineStrip = () => (
    <div
      ref={timelineRef}
      className="w-full overflow-x-auto"
      // Smooth horizontal scrolling with vertical wheel
      onWheel={(e) => {
        const el = timelineRef.current;
        if (!el) return;
        // if vertical delta is larger, translate it to horizontal scroll
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          el.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }}
    >
      <div className="flex gap-2">
        {frames.map((f) => (
          <button
            key={f.globalT}
            // Prevent focus-induced browser scroll jumps
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault();

              // 1) Save current horizontal scroll before we set state
              const el = timelineRef.current;
              if (el) timelineScrollRef.current = el.scrollLeft;

              // 2) Set selection (triggers re-render)
              setScrubT(f.globalT);

              // 3) Restore scroll on next frame to prevent "snap left"
              requestAnimationFrame(() => {
                const el2 = timelineRef.current;
                if (el2) el2.scrollLeft = timelineScrollRef.current;
              });

              // 4) (Optional) auto-center clicked thumbnail. Comment out to disable.
              if (el) {
                const crect = el.getBoundingClientRect();
                const brect = e.currentTarget.getBoundingClientRect();
                const delta =
                  brect.left - (crect.left + crect.width / 2 - brect.width / 2);
                el.scrollLeft += delta;
                // Keep our ref up-to-date so next re-render uses the centered value
                timelineScrollRef.current = el.scrollLeft;
              }

              // 5) Scroll chart into view vertically only (doesn't affect horizontal)
              chartContainerRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }}
            className={`relative flex-shrink-0 border rounded-md overflow-hidden ${
              scrubT === f.globalT ? "ring-2 ring-blue-500" : "hover:opacity-90"
            }`}
          >
            <img src={f.image} alt={`t=${f.localT}`} className="h-20 w-20 object-cover" />
            <span className="absolute bottom-0 right-0 m-1 text-[10px] px-1.5 rounded bg-black/70 text-white">
              t{f.localT}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  // ✅ Noise residual chart (continuous via globalT), highlight selected point, no re-animation
  const NoiseChart = () => {
    if (!chartPoints.length) return null;
    const latest = chartPoints[chartPoints.length - 1];
    return (
      <div className="w-full" ref={chartContainerRef}>
        <div className="text-sm font-medium text-gray-700 mb-2 text-center">
          Noise Residual (1 − cosine)
        </div>
        <div className="w-full h-56 bg-white rounded-lg border p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartPoints}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              onClick={(e) => {
                if (typeof e?.activeLabel === "number") {
                  setScrubT(e.activeLabel); // x = globalT
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" />
              <YAxis domain={[0, 1]} />
              <Tooltip
                formatter={(v) => Number(v).toFixed(4)}
                labelFormatter={(l) => `global t = ${l}`}
              />
              <Line
                type="monotone"
                dataKey="residual"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {typeof scrubT === "number" && (
                <ReferenceLine x={scrubT} stroke="#0ea5e9" strokeDasharray="4 3" />
              )}
              {selectedPoint && (
                <ReferenceDot x={selectedPoint.x} y={selectedPoint.residual} r={5} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 text-xs text-gray-500 text-center">
          Latest: global t={latest.x}, residual={latest.residual.toFixed(4)}
        </div>
      </div>
    );
  };

  // ---------------- Render ----------------
  return (
    <div className="min-h-screen flex bg-gray-100 text-gray-900">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        history={history}
        // 🔁 Selecting an item makes it the ACTIVE working image (and restores its timeline)
        onSelectItem={handleSelectFromSidebar}
        onDeleteItem={openDelete}
        onSettings={() => navigate("/settings")}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold">Welcome {username}, Ready to explore diffusion?</h1>
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
                  <ModeSelector />
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
                {(isStreaming || progress > 0) && <ProgressBar />}
              </div>

              {mode === "slow" && (isStreaming || frames.length > 0) && (
                <section className="bg-gray-50 border-t p-6 space-y-4">
                  <h2 className="text-lg font-semibold">Interactive Timeline</h2>
                  <TimelineStrip />
                  <NoiseChart />
                </section>
              )}
            </>
          )}
        </main>
      </div>

      {showDeleteModal && (
        <DeleteModal file={selectedForDelete} onCancel={closeDelete} onConfirm={confirmDelete} />
      )}
      {viewerImage && (
        <ImageViewerModal image={viewerImage} onClose={() => setViewerImage(null)} />
      )}
    </div>
  );
}
