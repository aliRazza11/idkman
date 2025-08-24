import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import { toUiImage } from "../utils/image";

export default function useImageHistory() {
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    try {
      const data = await api.fetchImages();
      setHistory(data.map(toUiImage));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { history, setHistory, refreshHistory: load };
}
