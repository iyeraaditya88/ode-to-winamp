'use client';

import { useState } from 'react';
import { usePlayer } from '@/contexts/PlayerContext';
import Equalizer from '@/components/Equalizer/Equalizer';

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const OUT = 'border border-black wa-out';
const IN = 'border border-black wa-in';

function TitleBar({ label }: { label: string }) {
  return (
    <div
      className="wa-titlebar h-[15px] flex items-center justify-center text-[8px] font-bold tracking-[0.3em] text-[#9c9c94]"
      style={{ textShadow: '1px 1px 0 #000' }}
    >
      {label}
    </div>
  );
}

function CBtn({
  onClick,
  title,
  children,
  down,
}: {
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
  down?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`wa-btn ${down ? 'wa-btn-down' : ''} border border-black h-[24px] min-w-[30px] px-1 flex items-center justify-center text-[#e2e2d8]`}
    >
      {children}
    </button>
  );
}

/** Small embossed toggle (ON / AUTO / SHUFFLE / REPEAT). */
function Toggle({
  on,
  onClick,
  children,
}: {
  on?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`wa-btn ${on ? 'wa-btn-down' : ''} border border-black px-1.5 py-px text-[8px] font-bold tracking-wider ${
        on ? 'text-[#00e000]' : 'text-[#86867c]'
      }`}
      style={on ? { textShadow: '0 0 4px rgba(0,224,0,.6)' } : undefined}
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

  const sliderStyle = {
    WebkitAppearance: 'slider-vertical',
    appearance: 'slider-vertical',
    writingMode: 'vertical-lr',
    direction: 'rtl',
    width: '14px',
    height: '46px',
  } as unknown as React.CSSProperties;

  const curve = bands
    .map((v, i) => {
      const x = 4 + (i / (bands.length - 1)) * 92;
      const y = 4 + ((100 - v) / 100) * 16;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className={`${OUT} wa-body p-[3px] shrink-0`}>
      <TitleBar label="WINAMP EQUALIZER" />
      <div className={`${IN} wa-body mt-[3px] p-2 flex flex-col gap-1.5`}>
        <div className="flex items-center gap-1.5">
          <Toggle on={on} onClick={() => setOn((v) => !v)}>
            ON
          </Toggle>
          <Toggle on={auto} onClick={() => setAuto((v) => !v)}>
            AUTO
          </Toggle>
          <span className="ml-auto text-[8px] tracking-widest text-[#8a8a80]">PRESETS</span>
        </div>

        {/* Response curve */}
        <div className={`${IN} wa-lcd`} style={{ height: 26 }}>
          <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="w-full h-full">
            <polyline
              points={curve}
              fill="none"
              stroke="#00e000"
              strokeWidth="1.4"
              style={{ filter: 'drop-shadow(0 0 1.5px #00e000)' }}
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
              className="accent-[#00c000]"
            />
            <span className="text-[7px] text-[#8a8a80] mt-0.5">PRE</span>
          </div>
          <div className="w-px self-stretch bg-black" />
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
                  className="accent-[#00c000]"
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

  const kbps = currentTrack ? '320' : '---';

  return (
    <div className="w-full max-w-[460px] mx-auto select-none font-mono text-[#c8c8c0] flex flex-col gap-[6px] lg:h-full">
      {/* ===== MAIN WINDOW ===== */}
      <div className={`${OUT} wa-body p-[3px] shrink-0`}>
        <TitleBar label="WINAMP" />
        <div className={`${IN} wa-body mt-[3px] p-2 flex flex-col gap-2`}>
          {/* time + visualizer */}
          <div className="flex items-stretch gap-2">
            <div
              className={`${IN} wa-lcd px-2.5 flex items-center text-[#00e000] text-[28px] leading-none tabular-nums tracking-[0.06em]`}
              style={{ textShadow: '0 0 7px rgba(0,224,0,.65)' }}
            >
              {fmt(position)}
            </div>
            <div className={`${IN} wa-lcd flex-1 h-[40px] px-1`}>
              <Equalizer isPlaying={isPlaying} theme="winamp" style="bars" barCount={19} className="h-full w-full" />
            </div>
          </div>

          {/* status line */}
          <div className="flex items-center gap-3 text-[8px] text-[#00b000]">
            <span className="tabular-nums">{kbps} kbps</span>
            <span>44 kHz</span>
            <div className="ml-auto flex items-center gap-2 text-[7px] tracking-[0.2em]">
              <span className={isPlaying ? 'text-[#00e000]' : 'text-[#3a3a36]'}>STEREO</span>
              <span className={!isPlaying ? 'text-[#e0b000]' : 'text-[#3a3a36]'}>
                {isPlaying ? 'PLAY' : 'PAUSE'}
              </span>
            </div>
          </div>

          {/* scrolling title */}
          <div className={`${IN} wa-lcd overflow-hidden whitespace-nowrap px-1.5 py-1`}>
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
            className="wa-slider w-full"
          />

          {/* transport + volume */}
          <div className="flex items-center gap-1">
            <CBtn onClick={playPrev} title="Previous">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
            </CBtn>
            <CBtn onClick={() => setIsPlaying(true)} title="Play" down={isPlaying}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </CBtn>
            <CBtn onClick={() => setIsPlaying(false)} title="Pause" down={!isPlaying && !!currentTrack}>
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

            <div className="ml-1.5 flex-1 flex flex-col justify-center">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                title="Volume"
                className="wa-slider w-full"
              />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              title="Balance"
              className="wa-slider w-14"
            />
          </div>

          {/* toggles */}
          <div className="flex items-center gap-1.5">
            <Toggle on={shuffle} onClick={toggleShuffle}>
              SHUFFLE
            </Toggle>
            <Toggle>REPEAT</Toggle>
          </div>
        </div>
      </div>

      {/* ===== EQUALIZER WINDOW ===== */}
      <EqWindow />

      {/* ===== PLAYLIST WINDOW ===== */}
      <div className={`${OUT} wa-body p-[3px] lg:flex-1 lg:min-h-0 flex flex-col`}>
        <TitleBar label="WINAMP PLAYLIST" />
        <div className={`${IN} wa-lcd mt-[3px] lg:flex-1 lg:min-h-0 flex flex-col`}>
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
                    isCurrent ? 'bg-[#0a2f6e] text-white' : 'text-[#00d000] hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="w-5 shrink-0 text-right opacity-70 tabular-nums">{i + 1}.</span>
                  <span className="flex-1 truncate">
                    {t.artists.map((a) => a.name).join(', ')} - {t.name}
                  </span>
                  <span className="shrink-0 tabular-nums opacity-80">{fmt(t.duration_ms)}</span>
                </button>
              );
            })}
          </div>
          <div className="shrink-0 flex items-center justify-between px-2 py-1 border-t border-[#0a2f1a] text-[9px] text-[#00d000] tabular-nums">
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
