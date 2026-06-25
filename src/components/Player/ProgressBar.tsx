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

  return (
    <div className="flex items-center gap-3 w-full">
      <span className="text-[10px] text-white/55 font-mono w-8 text-right shrink-0">
        {formatTime(position)}
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
          onMouseDown={() => {
            setSeeking(true);
            setSeekValue(progress / 100);
          }}
          onChange={(e) => setSeekValue(Number(e.target.value) / 100)}
          onMouseUp={(e) => {
            setSeeking(false);
            const val = Number((e.target as HTMLInputElement).value) / 100;
            onSeek(Math.round(val * duration));
          }}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
      </div>
      <span className="text-[10px] text-white/55 font-mono w-8 shrink-0">
        {formatTime(duration)}
      </span>
    </div>
  );
}
