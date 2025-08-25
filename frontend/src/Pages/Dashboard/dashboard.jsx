// src/Pages/Dashboard/dashboard.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
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
  const [uploadedImage, setUploadedImage] = useState(null);            // object URL for left preview
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState(null); // data URL for backend
  const [diffusedImage, setDiffusedImage] = useState(null);
  const [diffusion, setDiffusion] = useState({
    steps: 500,
    betaMin: "",
    betaMax: "",
    schedule: "linear",
  });

  // Fast vs Slow mode
  const [mode, setMode] = useState("fast"); // "fast" | "slow"

  // Streaming (WS) state
  const wsRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [currentStep, setCurrentStep] = useState(0);
  const [streamError, setStreamError] = useState("");

  // History
  const { history, setHistory, refreshHistory } = useImageHistory();
  const canDiffuse = useMemo(() => Boolean(uploadedImageDataUrl), [uploadedImageDataUrl]);

  // Fetch username once
  useEffect(() => {
    (async () => {
      const name = await getCurrentUsername();
      setUsername(name || "");
    })();
  }, []);

  // Preload image from navigation state
  useEffect(() => {
    if (preloaded) {
      setUploadedImage(preloaded.url);
      setUploadedImageDataUrl(preloaded.url);
    }
  }, [preloaded]);

  // Cleanup WS on unmount
  useEffect(() => {
    return () => {
      try {
        wsRef.current?.close();
      } catch {}
    };
  }, []);

  // ---- Handlers ----

  const handleUpload = async (file) => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setUploadedImage(objectUrl);

    const dataUrl = await fileToDataURL(file);
    setUploadedImageDataUrl(dataUrl);

    try {
      const item = await api.uploadImage(file);
      const uiItem = toUiImage(item);
      setHistory((prev) => [uiItem, ...prev]);
    } catch (err) {
      console.error(err);
    }
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

  // ---- Diffusion ----

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
    } catch (e) {
      console.error(e);
      alert(e.message || "Diffusion failed");
    }
  };

  const slowDiffuse = async () => {
    // Close any existing stream
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "cancel" }));
        wsRef.current.close();
      }
    } catch {}

    const steps = clamp(Number(diffusion.steps) || 1, 1, 1000);
    setIsStreaming(true);
    setProgress(0);
    setCurrentStep(0);
    setDiffusedImage(null);
    setStreamError("");

    // Resolve WS URL (fallback to localhost)
    const BASE_HTTP = api.baseURL || "http://localhost:8000"; // if your api service exposes baseURL
    const WS_URL = BASE_HTTP.replace(/^http/, "ws") + "/diffuse/ws";

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      const msg = {
        image_b64: uploadedImageDataUrl,
        steps,
        beta_start: diffusion.betaMin ? Number(diffusion.betaMin) : undefined,
        beta_end: diffusion.betaMax ? Number(diffusion.betaMax) : undefined,
        schedule: diffusion.schedule,
        seed: 42,
        preview_every: Math.max(1, Math.floor(0.5)), // ~25 updates
        quality: 85,
        data_url: true,
      };
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.image && typeof msg.t === "number") {
          setDiffusedImage(msg.image);
          setCurrentStep(msg.t);
          if (typeof msg.progress === "number") {
            setProgress(Math.max(0, Math.min(1, msg.progress)));
          }
        }
        if (msg.status === "done") {
          setIsStreaming(false);
          setProgress(1);
          setCurrentStep(steps - 1);
          ws.close();
        } else if (msg.status === "canceled") {
          setIsStreaming(false);
          ws.close();
        } else if (msg.status === "error") {
          setIsStreaming(false);
          setStreamError(msg.detail || "Streaming error");
          ws.close();
        }
      } catch (e) {
        console.error("WS parse error:", e);
      }
    };

    ws.onerror = (e) => {
      console.error("WS error:", e);
      setIsStreaming(false);
      setStreamError("WebSocket error");
    };

    ws.onclose = () => {
      setIsStreaming(false);
    };
  };

  const cancelStream = () => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "cancel" }));
        wsRef.current.close();
      }
    } catch {}
  };

  // ---- UI ----

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
          className="h-full bg-blue-600 transition-all"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-gray-600 text-center">
        {isStreaming
          ? `Streaming… step ${currentStep} / ${clamp(Number(diffusion.steps) || 1, 1, 1000) - 1}`
          : progress > 0 && progress < 1
          ? `Processing… ${Math.round(progress * 100)}%`
          : progress === 1
          ? "Done"
          : ""}
      </div>
      {streamError && (
        <div className="mt-2 text-xs text-red-600 text-center">{streamError}</div>
      )}
    </div>
  );

  return (
    <div className="h-screen flex bg-gray-100 text-gray-900 overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        history={history}
        onSelectItem={setViewerImage}
        onDeleteItem={openDelete}
        onSettings={() => navigate("/settings")}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col h-full">
        <header className="bg-white shadow p-4 border-b border-gray-200 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900">
            Welcome {username && `${username}`}, Ready to explore image diffusion?
          </h1>
        </header>

        <main className="flex-1 flex flex-col overflow-hidden">
          {!uploadedImage ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
              <label className="flex flex-col items-center justify-center w-full max-w-lg h-64 border-2 border-dashed border-gray-400 rounded-2xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition">
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
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-hidden">
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

              <div className="bg-white rounded-t-2xl shadow-md border-t border-gray-200 p-6">
                <div className="w-full flex flex-wrap items-center justify-center gap-6">
                  <UploadButton onSelect={handleUpload} label="Upload Another Image" compact />

                  {/* Mode selector inline */}
                  <ModeSelector />

                  {/* Your existing controls (steps, schedule, betaMin/Max, etc.) */}
                  <Controls diffusion={diffusion} setDiffusion={setDiffusion} onDiffuse={diffuse} />

                  {/* If slow mode, show cancel button while streaming */}
                  {mode === "slow" && isStreaming && (
                    <button
                      onClick={cancelStream}
                      className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {/* Progress bar for both modes; more meaningful in slow mode */}
                {(isStreaming || progress > 0) && <ProgressBar />}
              </div>
            </>
          )}
        </main>
      </div>

      {showDeleteModal && (
        <DeleteModal file={selectedForDelete} onCancel={closeDelete} onConfirm={confirmDelete} />
      )}
      {viewerImage && <ImageViewerModal image={viewerImage} onClose={() => setViewerImage(null)} />}
    </div>
  );
}
