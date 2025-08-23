import React, { useState } from "react";
import {
  Menu as MenuIcon,
  LogOut,
  Settings,
  Upload,
  Trash2,
  Download,
} from "lucide-react";

import image1 from "../../assets/nature.jpg"
export default function Dashboard() {
  const [diffusionValue, setDiffusionValue] = useState(500);
  const [collapsed, setCollapsed] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState(null);
  const [viewerImage, setViewerImage] = useState(null); // NEW: viewer modal state

  // Example image history (replace with DB fetch)
  const [history, setHistory] = useState([
     { id: 1, name: "flower.png", url: image1 },
    { id: 2, name: "city.jpg", url: "https://via.placeholder.com/600" },
    { id: 3, name: "portrait.jpeg", url: "https://via.placeholder.com/600" },
  ]);

  const sendToBackend = async (value) => {
    console.log("Sending to backend:", value);
    try{
      console.log("Sent to backend")
      const formData = new FormData()
      formData.append("file", value)
      const res = await fetch("http://localhost:8000/auth/upload", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      console.log(formData)
    }
    catch (err) {
      return {"message": "Communication error", "error": err.message}
    }

  };

  const handleUpload = (e) => {
    console.log("File uploaded")
    const file = e.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setUploadedImage(imageUrl);
      sendToBackend(file)
    }
  };

  const handleDelete = () => {
    if (selectedForDelete) {
      setHistory(history.filter((h) => h.id !== selectedForDelete.id));
      setShowDeleteModal(false);
      setSelectedForDelete(null);
    }
  };


  const handleLogout = async () => {
    try {
      const res = await fetch("http://localhost:8000/auth/logout", {
        method: "POST",
        credentials: "include", // important for cookies
      });

      if (!res.ok) {
        throw new Error("Logout failed");
      }

      const data = await res.json();
      console.log(data.detail); // "logged out"

      // TODO: clear app state (like user context, Redux, etc.)
      // Redirect to login page
      window.location.href = "/login";
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };


  const handleDownload = (item) => {
    const link = document.createElement("a");
    link.href = item.url;
    link.download = item.name;
    link.click();
  };

  return (
    <div className="h-screen flex bg-gray-100 text-gray-900 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`transition-all duration-300 flex flex-col border-r border-zinc-200 
          ${collapsed ? "w-16" : "w-64"} bg-gray-900 text-white`}
      >
        {/* Header */}
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
                onClick={() => setViewerImage(item)} // 👈 open viewer modal
              >
                <span className="truncate text-sm text-zinc-200">
                  {item.name}
                </span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(item);
                    }}
                    className="p-1 hover:bg-white/20 rounded"
                  >
                    <Download size={16} />
                  </button>
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
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-sm text-zinc-200">
            <Settings size={18} />
            {!collapsed && <span>Settings</span>}
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-sm text-zinc-200">
            <LogOut size={18} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full">
        <header className="bg-white shadow p-4 border-b border-gray-200 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900">
            Welcome, Ali — Ready to explore image diffusion?
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
                <p className="text-gray-600 text-center">
                  Choose an image to apply forward diffusion. Once uploaded,
                  you’ll see the results side by side.
                </p>
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
              <div className="flex justify-center p-4 border-b border-gray-200 bg-white shadow-sm">
                <label className="bg-gray-900 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-gray-800 transition font-medium">
                  Upload Another Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-hidden">
                <div className="bg-white rounded-2xl shadow-md border border-gray-200 flex flex-col overflow-hidden">
                  <h2 className="text-xl md:text-2xl font-bold text-center text-gray-900 py-3 border-b border-gray-200 flex-shrink-0">
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

                <div className="bg-white rounded-2xl shadow-md border border-gray-200 flex flex-col overflow-hidden">
                  <h2 className="text-xl md:text-2xl font-bold text-center text-gray-900 py-3 border-b border-gray-200 flex-shrink-0">
                    Diffused Image
                  </h2>
                  <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
                    <img
                      src={uploadedImage}
                      alt="Diffused"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-t-2xl shadow-md border-t border-gray-200 p-4 flex flex-col items-center flex-shrink-0">
                <label className="mb-2 font-semibold text-gray-800">
                  Diffusion Parameter: {diffusionValue}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1000"
                  value={diffusionValue}
                  onChange={(e) => setDiffusionValue(e.target.value)}
                  onMouseUp={() => sendToBackend(diffusionValue)}
                  onTouchEnd={() => sendToBackend(diffusionValue)}
                  className="w-full md:w-1/2 accent-black"
                />
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
              {/* Close button - pinned to top right of modal */}
              <button
                onClick={() => setViewerImage(null)}
                className="absolute -top-10 right-0 text-white bg-black/60 rounded-full p-2 hover:bg-black/80 transition"
              >
                ✕
              </button>

              {/* Image */}
              <img
                src={viewerImage.url}
                alt={viewerImage.name}
                className="max-h-[80vh] mx-auto rounded-lg object-contain shadow-lg"
              />

              {/* Caption */}
              <p className="text-center text-white mt-3 text-sm opacity-80">
                {viewerImage.name}
              </p>
            </div>
          </div>
        )}

    </div>
  );
}
