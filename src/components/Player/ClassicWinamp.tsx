'use client';

import { useState } from 'react';
import { usePlayer } from '@/contexts/PlayerContext';
import Equalizer from '@/components/Equalizer/Equalizer';

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Beveled-panel border helpers (the classic outset / inset look).
const OUT =
  'border border-t-[#5a5a52] border-l-[#5a5a52] border-r-[#0c0c0c] border-b-[#0c0c0c]';
const IN =
  'border border-t-[#0c0c0c] border-l-[#0c0c0c] border-r-[#5a5a52] border-b-[#5a5a52]';

function TitleBar({ label }: { label: string }) {
  return (
    <div
      className="h-[15px] flex items-center justify-center text-[8px] font-bold tracking-[0.25em] text-[#9a9a90] bg-gradient-to-b from-[#3c3c3c] to-[#1c1c1c]"
      style={{ textShadow: '0 1px 0 #000' }}
    >
      {label}
    </div>
  );
}

function CBtn({
  onClick,
  title,
  children,
  active,
}: {
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`h-[22px] min-w-[26px] px-1 flex items-center justify-center text-[#dcdcd2] bg-gradient-to-b from-[#3a3a3a] to-[#262626] active:translate-y-px ${
        active ? IN : OUT
      }`}
    >
      {children}
    </button>
  );
}

function EqWindow() {
  const [on, setOn] = useState(true);
  const [auto, setAuto] = useState(false);
  const [preamp, setPreamp] = useState(50);
  const [bands, setBands] = useState<number[]>([62, 70, 58, 50, 46, 52, 60, 66, 70, 64]);
  const labels = ['60', '170', '310', '600', '1K', '3K', '6K', '12K', '14K', '16K'];

  // 'slider-vertical' isn't in React's Appearance union, so cast through unknown.
  const sliderStyle = {
    WebkitAppearance: 'slider-vertical',
    appearance: 'slider-vertical',
    writingMode: 'vertical-lr',
    direction: 'rtl',
    width: '13px',
    height: '46px',
  } as unknown as React.CSSProperties;

  // Green response curve across the 10 bands.
  const curve = bands
    .map((v, i) => {
      const x = 4 + (i / (bands.length - 1)) * 92;
      const y = 4 + ((100 - v) / 100) * 16;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className={`${OUT} bg-[#2b2b2b] p-[3px] shrink-0`}>
      <TitleBar label="WINAMP EQUALIZER" />
      <div className={`${IN} bg-[#101010] mt-[3px] p-2 flex flex-col gap-1.5`}>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOn((v) => !v)}
            className={`px-1.5 text-[8px] font-bold tracking-wider ${OUT} ${
              on ? 'text-[#00e000]' : 'text-[#6a6a6a]'
            } bg-gradient-to-b from-[#3a3a3a] to-[#262626]`}
          >
            ON
          </button>
          <button
            onClick={() => setAuto((v) => !v)}
            className={`px-1.5 text-[8px] font-bold tracking-wider ${OUT} ${
              auto ? 'text-[#00e000]' : 'text-[#6a6a6a]'
            } bg-gradient-to-b from-[#3a3a3a] to-[#262626]`}
          >
            AUTO
          </button>
          <span className="ml-auto text-[8px] tracking-widest text-[#8a8a80]">PRESETS</span>
        </div>

        {/* Response curve */}
        <div className={`${IN} bg-black`} style={{ height: 24 }}>
          <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="w-full h-full">
            <polyline
              points={curve}
              fill="none"
              stroke="#00e000"
              strokeWidth="1.2"
              style={{ filter: 'drop-shadow(0 0 1px #00e000)' }}
            />
          </svg>
        </div>

        {/* Preamp + band sliders */}
        <div className="flex items-end gap-2 pt-1">
          <div className="flex flex-col items-center">
            <input
              type="range"
              min={0}
              max={100}
              value={preamp}
              onChange={(e) => setPreamp(Number(e.target.value))}
              style={sliderStyle}
              className="accent-[#00b000]"
            />
            <span className="text-[7px] text-[#8a8a80] mt-0.5">PRE</span>
          </div>
          <div className="w-px self-stretch bg-[#0c0c0c]" />
          <div className="flex items-end gap-[3px]">
            {bands.map((v, i) => (
              <div key={i} className="flex flex-col items-center">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={v}
                  onChange={(e) =>
                    setBands((b) => b.map((x, j) => (j === i ? Number(e.target.value) : x)))
                  }
                  style={sliderStyle}
                  className="accent-[#00b000]"
                />
                <span className="text-[6px] text-[#7a7a72] mt-0.5">{labels[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClassicWinamp() {
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    volume,
    shuffle,
    setIsPlaying,
    setPosition,
    setVolume,
    toggleShuffle,
    playNext,
    playPrev,
    queue,
    currentIndex,
    playTrack,
  } = usePlayer();

  const [balance, setBalance] = useState(50);

  const titleText = currentTrack
    ? `${currentTrack.artists.map((a) => a.name).join(', ')} - ${currentTrack.name}`
    : 'Ode to Winamp - load a track';

  return (
    <div className="w-full max-w-[460px] mx-auto select-none font-mono text-[#c8c8c0] flex flex-col gap-[6px] lg:h-full">
      {/* ===== MAIN WINDOW ===== */}
      <div className={`${OUT} bg-[#2b2b2b] p-[3px] shrink-0`}>
        <TitleBar label="WINAMP" />
        <div className={`${IN} bg-[#0e0e0e] mt-[3px] p-2 flex flex-col gap-2`}>
          {/* time + visualizer */}
          <div className="flex items-stretch gap-2">
            <div
              className={`${IN} bg-black px-2 flex items-center text-[#00e000] text-2xl tabular-nums tracking-wider`}
              style={{ textShadow: '0 0 6px rgba(0,224,0,.6)' }}
            >
              {fmt(position)}
            </div>
            <div className={`${IN} bg-black flex-1 h-[34px] px-1`}>
              <Equalizer isPlaying={isPlaying} theme="winamp" style="bars" barCount={19} className="h-full w-full" />
            </div>
          </div>

          {/* status line */}
          <div className="flex items-center gap-3 text-[8px] text-[#00b000]">
            <span>320 kbps</span>
            <span>44 kHz</span>
            <span className="ml-auto tracking-widest text-[#8a8a80]">
              {isPlaying ? 'STEREO' : 'PAUSED'}
            </span>
          </div>

          {/* scrolling title */}
          <div className="overflow-hidden whitespace-nowrap">
            <span
              className="wa-marquee text-[10px] text-[#00e000]"
              style={{ textShadow: '0 0 4px rgba(0,224,0,.5)' }}
            >
              {titleText}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{titleText}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;
            </span>
          </div>

          {/* seek */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            disabled={!currentTrack}
            className="w-full h-1.5 accent-[#00b000]"
          />

          {/* transport + volume */}
          <div className="flex items-center gap-1">
            <CBtn onClick={playPrev} title="Previous">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
            </CBtn>
            <CBtn onClick={() => setIsPlaying(true)} title="Play">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </CBtn>
            <CBtn onClick={() => setIsPlaying(false)} title="Pause">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
            </CBtn>
            <CBtn
              onClick={() => {
                setIsPlaying(false);
                setPosition(0);
              }}
              title="Stop"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" /></svg>
            </CBtn>
            <CBtn onClick={playNext} title="Next">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </CBtn>

            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              title="Volume"
              className="ml-1 flex-1 h-1.5 accent-[#00b000]"
            />
            <input
              type="range"
              min={0}
              max={100}
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              title="Balance"
              className="w-12 h-1.5 accent-[#6a6a62]"
            />
          </div>

          {/* toggles */}
          <div className="flex items-center gap-1.5 text-[8px] font-bold tracking-wider">
            <button
              onClick={toggleShuffle}
              className={`px-1.5 py-px ${OUT} bg-gradient-to-b from-[#3a3a3a] to-[#262626] ${
                shuffle ? 'text-[#00e000]' : 'text-[#7a7a72]'
              }`}
            >
              SHUFFLE
            </button>
            <button className={`px-1.5 py-px ${OUT} bg-gradient-to-b from-[#3a3a3a] to-[#262626] text-[#7a7a72]`}>
              REPEAT
            </button>
          </div>
        </div>
      </div>

      {/* ===== EQUALIZER WINDOW ===== */}
      <EqWindow />

      {/* ===== PLAYLIST WINDOW ===== */}
      <div className={`${OUT} bg-[#2b2b2b] p-[3px] lg:flex-1 lg:min-h-0 flex flex-col`}>
        <TitleBar label="WINAMP PLAYLIST" />
        <div className={`${IN} bg-black mt-[3px] lg:flex-1 lg:min-h-0 flex flex-col`}>
          <div className="max-h-44 lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto py-1">
            {queue.length === 0 && (
              <div className="px-2 py-3 text-[9px] text-[#4a7a4a]">Playlist is empty</div>
            )}
            {queue.map((t, i) => {
              const isCurrent = i === currentIndex;
              return (
                <button
                  key={`${t.id}-${i}`}
                  onClick={() => playTrack(t)}
                  className={`w-full flex items-baseline gap-2 px-2 py-[2px] text-left text-[10px] ${
                    isCurrent ? 'bg-[#00347a] text-white' : 'text-[#00c000] hover:bg-white/5'
                  }`}
                >
                  <span className="w-5 shrink-0 text-right opacity-70">{i + 1}.</span>
                  <span className="flex-1 truncate">
                    {t.artists.map((a) => a.name).join(', ')} - {t.name}
                  </span>
                  <span className="shrink-0 tabular-nums opacity-80">{fmt(t.duration_ms)}</span>
                </button>
              );
            })}
          </div>
          <div className="shrink-0 flex items-center justify-between px-2 py-1 border-t border-[#1a1a1a] text-[9px] text-[#00c000] tabular-nums">
            <span>{queue.length} items</span>
            <span style={{ textShadow: '0 0 4px rgba(0,224,0,.5)' }}>
              {fmt(position)} / {fmt(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
