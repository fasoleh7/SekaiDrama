// src/components/player/PlayerGestureOverlay.tsx
// Overlay gesture di atas video player.
// Letakkan komponen ini TEPAT di dalam wrapper <div> video,
// pastikan wrapper memiliki: position: relative  (atau className="relative")
//
// PENTING: Overlay hanya menutupi area ATAS video (bukan bagian bawah 56px)
// agar native controls (progress bar, play/pause) tetap bisa diakses.

"use client";

import { usePlayerGestures, GestureFeedback } from "@/hooks/usePlayerGestures";

// ─── Ikon SVG inline (tanpa dependency tambahan) ─────────────────────────────

function IconForward({ seconds }: { seconds: number }) {
  return (
    <svg viewBox="0 0 24 24" className="w-10 h-10 fill-white drop-shadow">
      <path d="M18 13a6 6 0 1 1-6-6v2a4 4 0 1 0 4 4h2z" />
      <path d="M15 3l4 4-4 4V7h-1V5h1V3z" />
      <text x="12" y="22" textAnchor="middle" fontSize="5" className="fill-white font-bold">
        {seconds}s
      </text>
    </svg>
  );
}

function IconRewind({ seconds }: { seconds: number }) {
  return (
    <svg viewBox="0 0 24 24" className="w-10 h-10 fill-white drop-shadow">
      <path d="M6 13a6 6 0 1 0 6-6v2a4 4 0 1 1-4 4H6z" />
      <path d="M9 3L5 7l4 4V7h1V5H9V3z" />
      <text x="12" y="22" textAnchor="middle" fontSize="5" className="fill-white font-bold">
        {seconds}s
      </text>
    </svg>
  );
}

function IconSpeed() {
  return (
    <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white drop-shadow">
      <path d="M13 2.05v2.02c3.95.49 7 3.85 7 7.93 0 3.21-1.81 6-4.72 7.72L13 17v5h5l-1.22-1.22C19.91 19.07 22 15.76 22 12c0-5.18-3.95-9.45-9-9.95zM11 2.05C5.95 2.55 2 6.82 2 12c0 3.76 2.09 7.07 5.22 8.78L6 22h5v-5l-2.28 2.28C7.81 18 6 15.21 6 12c0-4.08 3.05-7.44 7-7.93V2.05z" />
    </svg>
  );
}

// ─── Feedback bubble ──────────────────────────────────────────────────────────

function FeedbackBubble({ feedback }: { feedback: GestureFeedback }) {
  if (!feedback) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center animate-fadeIn">
      <div
        className={[
          "flex flex-col items-center gap-1 rounded-2xl px-5 py-3",
          "bg-black/50 backdrop-blur-sm text-white",
          feedback.type === "speed" ? "scale-110" : "",
        ].join(" ")}
      >
        {feedback.type === "forward" && (
          <>
            <IconForward seconds={feedback.seconds} />
            <span className="text-sm font-semibold">+{feedback.seconds} detik</span>
          </>
        )}
        {feedback.type === "rewind" && (
          <>
            <IconRewind seconds={feedback.seconds} />
            <span className="text-sm font-semibold">-{feedback.seconds} detik</span>
          </>
        )}
        {feedback.type === "speed" && (
          <>
            <IconSpeed />
            <span className="text-sm font-semibold">2× Kecepatan</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Ripple ───────────────────────────────────────────────────────────────────

function Ripple({ side }: { side: "left" | "right" }) {
  return (
    <div
      className={[
        "pointer-events-none absolute inset-0",
        side === "left" ? "rounded-r-full" : "rounded-l-full",
        "bg-white/10 animate-rippleFade",
      ].join(" ")}
    />
  );
}

// ─── Komponen utama ───────────────────────────────────────────────────────────

interface PlayerGestureOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  seekSeconds?: number;
  fastSpeed?: number;
}

export function PlayerGestureOverlay({
  videoRef,
  seekSeconds = 5,
  fastSpeed = 2,
}: PlayerGestureOverlayProps) {
  const { feedback, leftProps, rightProps } = usePlayerGestures({
    videoRef,
    seekSeconds,
    fastSpeed,
  });

  // Overlay hanya menutupi area di ATAS native controls (bottom-14 = 56px ruang untuk controls)
  // Ini mencegah gesture area menghalangi progress bar dan tombol play/pause native
  const overlayClass = "absolute top-0 bottom-14 z-10 w-1/2 select-none touch-none";

  return (
    <>
      {/* ── Sisi kiri: mundur ── */}
      <div
        {...leftProps}
        className={`${overlayClass} left-0`}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        {feedback?.type === "rewind" && <Ripple side="left" />}
        {feedback?.type === "rewind" && <FeedbackBubble feedback={feedback} />}
      </div>

      {/* ── Sisi kanan: maju / 2× ── */}
      <div
        {...rightProps}
        className={`${overlayClass} right-0`}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        {(feedback?.type === "forward" || feedback?.type === "speed") && (
          <Ripple side="right" />
        )}
        {(feedback?.type === "forward" || feedback?.type === "speed") && (
          <FeedbackBubble feedback={feedback} />
        )}
      </div>
    </>
  );
}
