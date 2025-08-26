import { useRef, useState, useLayoutEffect, useCallback } from "react";

export default function usePerImageTimeline() {
  const [frames, setFrames] = useState([]);
  const [scrubT, setScrubT] = useState(null);

  const framesByImageRef = useRef(new Map());
  const tOffsetRef = useRef(0);
  const timelineRef = useRef(null);
  const timelineScrollRef = useRef(0);

  const ssKey = useCallback((k) => `frames:${k}`, []);

  const saveFramesForImage = useCallback((key, framesArr) => {
    if (!key) return;
    framesByImageRef.current.set(key, framesArr);
    try {
      sessionStorage.setItem(ssKey(key), JSON.stringify(framesArr));
    } catch {}
  }, [ssKey]);

  const loadFramesForImage = useCallback((key) => {
    if (!key) return [];
    const mem = framesByImageRef.current.get(key);
    if (mem) return mem;
    try {
      const raw = sessionStorage.getItem(ssKey(key));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [ssKey]);

  useLayoutEffect(() => {
    const el = timelineRef.current;
    if (el) el.scrollLeft = timelineScrollRef.current;
  }, [frames.length, scrubT]);

  const rememberScroll = useCallback(() => {
    const el = timelineRef.current;
    if (el) timelineScrollRef.current = el.scrollLeft;
  }, []);

  const restoreScroll = useCallback(() => {
    const el = timelineRef.current;
    if (el) el.scrollLeft = timelineScrollRef.current;
  }, []);

  const computeNextOffsetFrom = useCallback(
    (arr) => (arr.length ? arr[arr.length - 1].globalT + 1 : 0),
    []
  );

  return {
    frames, setFrames, scrubT, setScrubT,
    tOffsetRef, timelineRef, timelineScrollRef,
    saveFramesForImage, loadFramesForImage, rememberScroll, restoreScroll,
    computeNextOffsetFrom,
  };
}
