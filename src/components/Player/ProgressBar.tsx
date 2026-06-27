'use client';

import { useState } from 'react';

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
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  const progress = duration > 0 ? (seeking ? seekValue : position / duration) * 100 : 0;

  // Commit a seek from the raw 0–100 slider value (works for mouse + touch).
  const commit = (raw: number) => {
    setSeeking(false);
    onSeek(Math.round((raw / 100) * duration));
  };

  return (
    <div className="flex items-center gap-3 w-full">
      <span className="text-[10px] text-white/55 font-mono w-8 text-right shrink-0">
        {formatTime(seeking ? seekValue * duration : position)}
      </span>
      <div className="relative flex-1 h-1 group">
        <div className="absolute inset-y-0 w-full rounded-full bg-white/10" />
        <div
          className="absolute inset-y-0 rounded-full bg-white/60 group-hover:bg-[#00b4b4] transition-colors"
          style={{ width: `${progress}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={0.01}
          value={seeking ? seekValue * 100 : progress}
          // Pointer events cover both mouse and touch; touch-action:none keeps the
          // horizontal drag from being hijacked into a scroll on mobile.
          onPointerDown={() => {
            setSeeking(true);
            setSeekValue(progress / 100);
          }}
          onChange={(e) => setSeekValue(Number(e.target.value) / 100)}
          onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
          onPointerCancel={(e) => commit(Number((e.target as HTMLInputElement).value))}
          style={{ touchAction: 'none' }}
          // Extend the (invisible) hit area well beyond the 4px bar so it's
          // easy to grab on touch.
          className="absolute -inset-y-3 inset-x-0 opacity-0 cursor-pointer"
        />
      </div>
      <span className="text-[10px] text-white/55 font-mono w-8 shrink-0">
        {formatTime(duration)}
      </span>
    </div>
  );
}
