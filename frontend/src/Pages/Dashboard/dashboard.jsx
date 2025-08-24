import React, { useMemo, useState, useEffect} from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUsername } from "../../utils/user";
import Sidebar from "../../Components/Sidebar";
import UploadButton from "../../Components/UploadButton";
import ImageCard from "../../Components/ImageCard";
import Controls from "../../Components/Controls";
import DeleteModal from "../../Components/DeleteModal";
import ImageViewerModal from "../../Components/ImageViewerModal";
import useImageHistory from "../../hooks/useImageHistory";
import { api } from "../../services/api";
import { toUiImage, fileToDataURL, clamp } from "../../utils/image";

export default function Dashboard() {
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState(null);
  const [viewerImage, setViewerImage] = useState(null);
  const [username, setUsername] = useState("");
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState(null);
  const [diffusedImage, setDiffusedImage] = useState(null);
  const [diffusion, setDiffusion] = useState({
    steps: 500,
    betaMin: "",
    betaMax: "",
    schedule: "linear",
  });

  const { history, setHistory, refreshHistory } = useImageHistory();
  const canDiffuse = useMemo(() => Boolean(uploadedImageDataUrl), [uploadedImageDataUrl]);

  useEffect(() => {
    (async () => {
      const name = await getCurrentUsername();
      setUsername(name);
    })();
  }, []);

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

  const diffuse = async () => {
    if (!canDiffuse) {
      alert("Please upload an image first.");
      return;
    }
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
    } catch (e) {
      console.error(e);
      alert(e.message || "Diffusion failed");
    }
  };

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
                  <label
                    className="flex flex-col items-center justify-center w-full max-w-lg h-64 border-2 border-dashed border-gray-400 rounded-2xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition"
                  >
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
                <ImageCard title="Diffused Image" src={diffusedImage} placeholder="Click Diffuse to generate image" />
              </div>
              <div className="bg-white rounded-t-2xl shadow-md border-t border-gray-200 p-6">
                <div className="w-full flex flex-wrap items-center justify-center gap-6">
                  <UploadButton onSelect={handleUpload} label="Upload Another Image" compact />
                  <Controls diffusion={diffusion} setDiffusion={setDiffusion} onDiffuse={diffuse} />
                </div>
              </div>
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
