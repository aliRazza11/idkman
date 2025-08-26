import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { toUiImage } from "../utils/image";

export default function useImageHistory() {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const seqRef = useRef(0); // prevents race conditions

  // Replace the whole list
  const replaceAll = useCallback((items) => {
    setHistory(Array.isArray(items) ? items : []);
  }, []);

  // Add or update a single item
  const addOrUpdate = useCallback((item) => {
    setHistory((prev) => {
      const idx = prev.findIndex((x) => x.id === item.id);
      if (idx === -1) return [item, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], ...item };
      return next;
    });
  }, []);

  // Remove by ID
  const removeById = useCallback((id) => {
    setHistory((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Refresh from server
  const refreshHistory = useCallback(async () => {
    const mySeq = ++seqRef.current;
    setIsLoading(true);
    setError("");
    try {
      const data = await api.fetchImages();
      if (seqRef.current === mySeq) {
        replaceAll(data.map(toUiImage));
      }
    } catch (e) {
      if (seqRef.current === mySeq) {
        setError(e?.message || "Failed to load images");
      }
    } finally {
      if (seqRef.current === mySeq) {
        setIsLoading(false);
      }
    }
  }, [replaceAll]);

  // Initial load
  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  return {
    history,
    isLoading,
    error,
    refreshHistory,
    addOrUpdate,
    removeById,
  };
}
