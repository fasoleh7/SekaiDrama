// src/hooks/usePlayerGestures.ts
// Hook untuk gesture kontrol video ala YouTube
// - Double tap kiri  : mundur 5 detik
// - Double tap kanan : maju 5 detik
// - Tahan kanan      : kecepatan 2x (lepas = kembali normal)

import { useRef, useCallback, useState } from "react";

export type GestureFeedback =
  | { type: "rewind"; seconds: number }
  | { type: "forward"; seconds: number }
  | { type: "speed"; active: boolean }
  | null;

interface UsePlayerGesturesOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  seekSeconds?: number;   // detik per double-tap (default: 5)
  fastSpeed?: number;     // kecepatan tahan layar (default: 2)
}

export function usePlayerGestures({
  videoRef,
  seekSeconds = 5,
  fastSpeed = 2,
}: UsePlayerGesturesOptions) {
  // ─── State feedback animasi ───────────────────────────────────────────────
  const [feedback, setFeedback] = useState<GestureFeedback>(null);

  // ─── Ref internal ────────────────────────────────────────────────────────
  const lastTapTimeRef   = useRef<number>(0);
  const lastTapSideRef   = useRef<"left" | "right" | null>(null);
  const holdTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef     = useRef(false);
  const normalSpeedRef   = useRef(1);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Helper: tampilkan feedback lalu sembunyikan ──────────────────────────
  const showFeedback = useCallback((fb: GestureFeedback) => {
    setFeedback(fb);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    // Feedback speed tetap tampil selama ditahan; sisanya 800 ms
    if (fb?.type !== "speed") {
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), 800);
    }
  }, []);

  // ─── Seek ─────────────────────────────────────────────────────────────────
  const seek = useCallback(
    (side: "left" | "right") => {
      const video = videoRef.current;
      if (!video) return;

      if (side === "right") {
        video.currentTime = Math.min(video.currentTime + seekSeconds, video.duration || 0);
        showFeedback({ type: "forward", seconds: seekSeconds });
      } else {
        video.currentTime = Math.max(video.currentTime - seekSeconds, 0);
        showFeedback({ type: "rewind", seconds: seekSeconds });
      }
    },
    [videoRef, seekSeconds, showFeedback]
  );

  // ─── Aktifkan / matikan mode cepat ───────────────────────────────────────
  const activateFastSpeed = useCallback(() => {
    const video = videoRef.current;
    if (!video || isHoldingRef.current) return;
    isHoldingRef.current = true;
    normalSpeedRef.current = video.playbackRate;
    video.playbackRate = fastSpeed;
    showFeedback({ type: "speed", active: true });
  }, [videoRef, fastSpeed, showFeedback]);

  const deactivateFastSpeed = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isHoldingRef.current) return;
    isHoldingRef.current = false;
    video.playbackRate = normalSpeedRef.current;
    setFeedback(null);
  }, [videoRef]);

  // ─── Handler utama: pointer down ─────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, side: "left" | "right") => {
      // Hanya sisi kanan yang memiliki fitur tahan
      if (side === "right") {
        holdTimerRef.current = setTimeout(() => {
          activateFastSpeed();
        }, 300); // mulai tahan setelah 300 ms
      }

      // ── Deteksi double tap ──────────────────────────────────────────────
      const now = Date.now();
      const gap = now - lastTapTimeRef.current;
      const sameSide = lastTapSideRef.current === side;

      if (gap < 300 && sameSide) {
        // Double tap terdeteksi → batalkan hold, lakukan seek
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        seek(side);
        // Reset agar triple tap tidak dihitung ganda
        lastTapTimeRef.current = 0;
        lastTapSideRef.current = null;
      } else {
        lastTapTimeRef.current = now;
        lastTapSideRef.current = side;
      }
    },
    [seek, activateFastSpeed]
  );

  // ─── Handler utama: pointer up / leave ───────────────────────────────────
  const handlePointerUp = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    deactivateFastSpeed();
  }, [deactivateFastSpeed]);

  // ─── Return public API ────────────────────────────────────────────────────
  return {
    feedback,
    /** Pasang ke div overlay sisi kiri */
    leftProps: {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) =>
        handlePointerDown(e, "left"),
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerUp,
    },
    /** Pasang ke div overlay sisi kanan */
    rightProps: {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) =>
        handlePointerDown(e, "right"),
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerUp,
    },
  };
}
