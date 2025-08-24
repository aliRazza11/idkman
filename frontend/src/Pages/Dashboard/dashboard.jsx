import React, { useEffect, useState } from "react";
import {
  Menu as MenuIcon,
  LogOut,
  Settings,
  Upload,
  Trash2,
  Download,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [diffusionValue, setDiffusionValue] = useState(500);
  const [betaMin, setBetaMin] = useState("");
  const [betaMax, setBetaMax] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null); // preview URL
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState(null); // base64 dataURL for backend
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState(null);
  const [viewerImage, setViewerImage] = useState(null);
  const [history, setHistory] = useState([]);
  const navigate = useNavigate();


  // New states for diffusion
  const [diffusedImage, setDiffusedImage] = useState(null);
  const [schedule, setSchedule] = useState("linear"); // could add a dropdown later

  const toUiImage = (item) => ({
    id: item.id,
    name: item.filename,
    url: `data:${item.content_type};base64,${item.image_data}`,
    downloadHref: `http://localhost:8000/images/${item.id}`,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:8000/images", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load images");
        const data = await res.json();
        setHistory(data.map(toUiImage));
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // helper: convert File → base64 data URL
  const fileToDataURL = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // local preview
      setUploadedImage(URL.createObjectURL(file));
      // also keep base64 for backend
      const dataUrl = await fileToDataURL(file);
      setUploadedImageDataUrl(dataUrl);

      // upload to history (optional, you already had this)
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://localhost:8000/images", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const item = await res.json();
      const uiItem = toUiImage(item);
      setHistory((prev) => [uiItem, ...prev]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!selectedForDelete) return;
    try {
      const res = await fetch(
        `http://localhost:8000/images/${selectedForDelete.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("Delete failed");
      setHistory((h) => h.filter((x) => x.id !== selectedForDelete.id));
    } catch (e) {
      console.error(e);
    } finally {
      setShowDeleteModal(false);
      setSelectedForDelete(null);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("http://localhost:8000/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Logout failed");
      navigate("/login", { replace: true });
      window.location.reload();
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };

  // ✅ Diffusion endpoint call
  const sendToBackend = async () => {
    if (!uploadedImageDataUrl) {
      alert("Please upload an image first.");
      return;
    }

    // sanitize & defaults
    const steps = Math.max(1, Math.min(1000, Number(diffusionValue) || 1));
    const beta_start = betaMin ? Number(betaMin) : undefined;
    const beta_end = betaMax ? Number(betaMax) : undefined;

    try {
      const res = await fetch("http://localhost:8000/diffuse", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_b64: uploadedImageDataUrl, // data URL string
          steps,
          schedule,
          beta_start,
          beta_end,
          seed: 42, // deterministic
          return_data_url: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error('error is here' || "Diffusion failed");
      }
      const data = await res.json();
      setDiffusedImage(data.image);
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  };

  return (
    <div className="h-screen flex bg-gray-100 text-gray-900 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`transition-all duration-300 flex flex-col border-r border-zinc-200 
          ${collapsed ? "w-16" : "w-64"} bg-gray-900 text-white`}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-700/50">
          {!collapsed && <span className="text-lg font-bold">DiffusionApp</span>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-white/10 rounded"
          >
            <MenuIcon size={20} />
          </button>
        </div>

        {/* History */}
        {!collapsed && (
          <nav className="flex-1 overflow-y-auto p-2 space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 group cursor-pointer"
                onClick={() => setViewerImage(item)}
              >
                <span className="truncate text-sm text-zinc-200">
                  {item.name}
                </span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                  <a
                    href={item.downloadHref}
                    download={item.name}
                    className="p-1 hover:bg-white/20 rounded"
                  >
                    <Download size={16} />
                  </a>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedForDelete(item);
                      setShowDeleteModal(true);
                    }}
                    className="p-1 hover:bg-red-500/80 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </nav>
        )}

        {/* Bottom actions */}
        <div className="p-2 border-t border-zinc-700/50 flex flex-col gap-1 mt-auto">
          <button
          onClick={() => navigate("/settings")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-sm text-zinc-200"
        >
          <Settings size={18} />
          {!collapsed && <span>Settings</span>}
        </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-sm text-zinc-200"
          >
            <LogOut size={18} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full">
        <header className="bg-white shadow p-4 border-b border-gray-200 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900">
            Welcome — Ready to explore image diffusion?
          </h1>
        </header>

        <main className="flex-1 flex flex-col overflow-hidden">
          {!uploadedImage ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
              <div className="bg-white border border-gray-300 rounded-2xl shadow-lg p-12 flex flex-col items-center space-y-6">
                <Upload size={48} className="text-gray-500" />
                <h2 className="text-xl font-bold text-gray-800">
                  Upload an Image to Start
                </h2>
                <label className="bg-gray-900 text-white px-6 py-3 rounded-lg cursor-pointer hover:bg-gray-800 transition">
                  Choose File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          ) : (
            <>
              {/* Cards grid */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-hidden">
                {/* Original */}
                <div className="bg-white rounded-2xl shadow-md border border-gray-200 flex flex-col overflow-hidden">
                  <h2 className="text-xl md:text-2xl font-bold text-center text-gray-900 py-3 border-b border-gray-200">
                    Original Image
                  </h2>
                  <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
                    <img
                      src={uploadedImage}
                      alt="Original"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>

                {/* Diffused */}
                <div className="bg-white rounded-2xl shadow-md border border-gray-200 flex flex-col overflow-hidden">
                  <h2 className="text-xl md:text-2xl font-bold text-center text-gray-900 py-3 border-b border-gray-200">
                    Diffused Image
                  </h2>
                  <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
                    <img
                      src={diffusedImage || uploadedImage}
                      alt="Diffused"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="bg-white rounded-t-2xl shadow-md border-t border-gray-200 p-6">
                <div className="w-full flex flex-wrap items-center justify-center gap-6">
                  {/* Upload another */}
                  <label className="bg-gray-900 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-gray-800 transition font-medium flex items-center">
                    Upload Another Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUpload}
                      className="hidden"
                    />
                  </label>

                  {/* Slider */}
                  <div className="flex flex-col items-center w-64">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      Steps: {diffusionValue}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1000"
                      value={diffusionValue}
                      onChange={(e) => setDiffusionValue(e.target.value)}
                      className="w-full accent-black"
                    />
                  </div>

                  {/* Beta Min */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Beta Min</label>
                    <input
                      type="number"
                      value={betaMin}
                      onChange={(e) => setBetaMin(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 w-20 text-center"
                    />
                  </div>

                  {/* Beta Max */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Beta Max</label>
                    <input
                      type="number"
                      value={betaMax}
                      onChange={(e) => setBetaMax(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 w-20 text-center"
                    />
                  </div>

                  {/* Diffuse button */}
                  <button
                    onClick={sendToBackend}
                    className="bg-gray-900 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition font-semibold"
                  >
                    Diffuse
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-80 text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Are you sure you want to delete{" "}
              <span className="font-bold">{selectedForDelete?.name}</span>?
            </h2>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Viewer Modal */}
      {viewerImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="relative max-w-5xl max-h-[90vh] w-full flex flex-col items-center">
            <button
              onClick={() => setViewerImage(null)}
              className="absolute -top-10 right-0 text-white bg-black/60 rounded-full p-2 hover:bg-black/80 transition"
            >
              ✕
            </button>
            <img
              src={viewerImage.url}
              alt={viewerImage.name}
              className="max-h-[80vh] mx-auto rounded-lg object-contain shadow-lg"
            />
            <p className="text-center text-white mt-3 text-sm opacity-80">
              {viewerImage.name}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
