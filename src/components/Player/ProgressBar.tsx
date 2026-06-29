'use client';

import { useRef, useState } from 'react';

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface ProgressBarProps {
  position: number;
  duration: number;
  onSeek: (ms: number) => void;
}

export default function ProgressBar({ position, duration, onSeek }: ProgressBarProps) {
  const hitRef = useRef<HTMLDivElement>(null);
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0); // 0..1 while dragging

  const fraction = duration > 0 ? (seeking ? seekValue : position / duration) : 0;
  const progress = Math.min(1, Math.max(0, fraction)) * 100;

  // Map a pointer's clientX onto a 0..1 fraction of the bar's width.
  const fractionFromClientX = (clientX: number) => {
    const el = hitRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  // A custom pointer-driven slider (instead of <input type="range">): native
  // range inputs only reliably tap-to-jump on touch — a drag that starts off the
  // thumb often never fires. Capturing the pointer lets the drag track the finger
  // from anywhere on the bar, even if it strays vertically off the 4px track.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSeeking(true);
    setSeekValue(fractionFromClientX(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!seeking) return;
    setSeekValue(fractionFromClientX(e.clientX));
  };

  const commit = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!seeking) return;
    const f = fractionFromClientX(e.clientX);
    setSeeking(false);
    onSeek(Math.round(f * duration));
  };

  return (
    <div className="flex items-center gap-3 w-full">
      <span className="text-[10px] text-white/55 font-mono w-8 text-right shrink-0">
        {formatTime(seeking ? seekValue * duration : position)}
      </span>
      <div className="relative flex-1 h-1 group">
        <div className="absolute inset-y-0 left-0 w-full rounded-full bg-white/10" />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/60 group-hover:bg-[#00b4b4] transition-colors"
          style={{ width: `${progress}%` }}
        />
        {/* Thumb — purely visual; the hit layer below handles all input. */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${progress}%`, opacity: seeking ? 1 : undefined }}
        />
        {/* Interactive hit layer — extends well beyond the 4px bar so it's easy
            to grab on touch. touch-action:none stops the horizontal drag from
            being hijacked into a page scroll. */}
        <div
          ref={hitRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(fraction * duration)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={commit}
          onPointerCancel={commit}
          style={{ touchAction: 'none' }}
          className="absolute -inset-y-3 inset-x-0 cursor-pointer"
        />
      </div>
      <span className="text-[10px] text-white/55 font-mono w-8 shrink-0">
        {formatTime(duration)}
      </span>
    </div>
  );
}
