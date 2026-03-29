// src/components/player/UnmuteButton.tsx
// Tombol unmute yang muncul saat video autoplay dalam keadaan muted.
// Browser policy: autoplay hanya diizinkan kalau video muted.
// Tombol ini memberi user kontrol untuk unmute dengan 1 klik.

"use client";

import { useState, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface UnmuteButtonProps {
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function UnmuteButton({ videoRef }: UnmuteButtonProps) {
  const [isMuted, setIsMuted] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Tampilkan tombol hanya saat video sedang/sudah play
    const onPlay = () => setVisible(true);
    const onVolumeChange = () => {
      setIsMuted(video.muted);
      // Sembunyikan tombol setelah 2 detik kalau sudah unmute
      if (!video.muted) {
        setTimeout(() => setVisible(false), 2000);
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("playing", onPlay);
    video.addEventListener("volumechange", onVolumeChange);

    // Cek state awal
    if (!video.paused) setVisible(true);
    setIsMuted(video.muted);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("playing", onPlay);
      video.removeEventListener("volumechange", onVolumeChange);
    };
  }, [videoRef]);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    video.volume = video.muted ? video.volume : Math.max(video.volume, 0.5);
  };

  if (!visible) return null;

  return (
    <button
      onClick={toggleMute}
      className="absolute bottom-20 right-4 z-20 flex items-center gap-2 
                 bg-black/70 hover:bg-black/90 backdrop-blur-sm 
                 text-white text-sm font-medium 
                 px-3 py-2 rounded-full border border-white/20
                 transition-all duration-200 active:scale-95 select-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
      aria-label={isMuted ? "Aktifkan suara" : "Matikan suara"}
    >
      {isMuted ? (
        <>
          <VolumeX className="w-4 h-4 text-red-400" />
          <span className="text-xs">Ketuk untuk suara</span>
        </>
      ) : (
        <>
          <Volume2 className="w-4 h-4 text-green-400" />
          <span className="text-xs">Suara aktif</span>
        </>
      )}
    </button>
  );
}
