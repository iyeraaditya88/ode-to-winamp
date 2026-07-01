'use client';

import { useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { m, useMotionValue, animate } from 'framer-motion';
import { usePlayer } from '@/contexts/PlayerContext';
import { useEqualizerSettings, EQ_STYLES, EQ_THEMES } from '@/hooks/useEqualizerSettings';
import { useShareTrack } from '@/hooks/useShareTrack';
import ProgressBar from './ProgressBar';
import VolumeControl from './VolumeControl';
import Equalizer from '@/components/Equalizer/Equalizer';
import LyricsPanel from '@/components/Lyrics/LyricsPanel';
import QueuePanel from '@/components/Queue/QueuePanel';
import LikeButton from './LikeButton';
import NowPlaying from './NowPlaying';

const SHEET_SPRING = { type: 'spring', stiffness: 360, damping: 38 } as const;

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    volume,
    shuffle,
    showLyrics,
    showQueue,
    setIsPlaying,
    setPosition,
    setVolume,
    toggleLyrics,
    toggleQueue,
    toggleShuffle,
    playNext,
    playPrev,
    setShowNowPlaying,
  } = usePlayer();

  const { settings, update } = useEqualizerSettings();
  const { share } = useShareTrack();
  const art = currentTrack?.album.images.slice(-1)[0]?.url;
  // Suppress the click that may follow a swipe so it doesn't toggle twice.
  const justSwiped = useRef(false);

  // Bottom-sheet expand: one shared progress value (0 collapsed → 1 expanded)
  // drives the Now Playing sheet so it follows the drag, then snaps.
  const sheetProgress = useMotionValue(0);
  const [sheetMounted, setSheetMounted] = useState(false);
  const panStart = useRef(0);

  const openSheet = useCallback(() => {
    if (!currentTrack) return;
    setSheetMounted(true);
    // Mark the grid as covered so its WebGL loop suspends (battery on mobile).
    animate(sheetProgress, 1, { ...SHEET_SPRING, onComplete: () => setShowNowPlaying(true) });
  }, [sheetProgress, currentTrack, setShowNowPlaying]);

  const closeSheet = useCallback(() => {
    // Resume the grid immediately so it's live as the sheet slides away.
    setShowNowPlaying(false);
    animate(sheetProgress, 0, { ...SHEET_SPRING, onComplete: () => setSheetMounted(false) });
  }, [sheetProgress, setShowNowPlaying]);

  // Clicking the visualizer cycles its waveform type and colour together.
  const cycleVisualizer = () => {
    const sIdx = EQ_STYLES.findIndex((s) => s.id === settings.style);
    const tIdx = EQ_THEMES.findIndex((t) => t.id === settings.theme);
    update({
      style: EQ_STYLES[(sIdx + 1) % EQ_STYLES.length].id,
      theme: EQ_THEMES[(tIdx + 1) % EQ_THEMES.length].id,
    });
  };

  return (
    <>
      <LyricsPanel isOpen={showLyrics} onClose={toggleLyrics} track={currentTrack} positionMs={position} />
      <QueuePanel isOpen={showQueue} onClose={toggleQueue} />
      {sheetMounted && <NowPlaying progress={sheetProgress} onCollapse={closeSheet} />}

      <m.div
        onClick={() => {
          if (justSwiped.current) {
            justSwiped.current = false;
            return;
          }
          openSheet();
        }}
        onPanStart={() => {
          document.body.classList.add('dragging-sheet');
          if (currentTrack) panStart.current = sheetProgress.get();
        }}
        onPan={(_e, info) => {
          if (!currentTrack) return;
          // Ignore mostly-horizontal gestures so the seek/volume sliders work.
          if (Math.abs(info.offset.x) > Math.abs(info.offset.y) + 6) return;
          setSheetMounted(true);
          const p = panStart.current - info.offset.y / window.innerHeight;
          sheetProgress.set(Math.max(0, Math.min(1, p)));
        }}
        onPanEnd={(_e, info) => {
          document.body.classList.remove('dragging-sheet');
          if (!currentTrack) return;
          if (Math.abs(info.offset.x) > Math.abs(info.offset.y) + 6) return;
          justSwiped.current = true;
          window.setTimeout(() => {
            justSwiped.current = false;
          }, 350);
          const p = sheetProgress.get();
          const open = info.velocity.y < -350 ? true : info.velocity.y > 350 ? false : p > 0.35;
          if (open) openSheet();
          else closeSheet();
        }}
        title={currentTrack ? 'Tap or drag up to expand' : undefined}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', touchAction: 'none' }}
        className={`fixed bottom-0 left-0 right-0 z-30 select-none border-t border-white/5 bg-[#111111]/95 backdrop-blur-md ${
          currentTrack ? 'cursor-pointer' : ''
        }`}
      >
        {/* Grabber handle — overlay so it doesn't add height to the bar */}
        {currentTrack && (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 h-1 w-9 rounded-full bg-white/20" />
        )}

        {/* Mobile-only thin progress line across the top of the bar */}
        <div className="sm:hidden h-[2px] w-full bg-white/10">
          <div
            className="h-full bg-[#00b4b4] transition-[width] duration-300"
            style={{ width: `${duration > 0 ? (position / duration) * 100 : 0}%` }}
          />
        </div>

        <div className="mx-auto max-w-screen-2xl px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2 sm:grid sm:grid-cols-3 sm:gap-4">
            {/* Left: track info + expand */}
            <div className="flex items-center gap-3 min-w-0 flex-1 sm:flex-none">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openSheet();
                }}
                disabled={!currentTrack}
                title="Expand"
                className="relative h-10 w-10 shrink-0 overflow-hidden rounded-sm bg-white/5 group disabled:cursor-default"
              >
                {art && <Image src={art} alt="" fill sizes="40px" className="object-cover" />}
                {currentTrack && (
                  <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </button>
              {currentTrack ? (
                <div className="min-w-0 flex-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openSheet();
                    }}
                    className="block w-full max-w-full truncate text-xs font-medium text-white/90 hover:text-white text-left"
                  >
                    {currentTrack.name}
                  </button>
                  <p className="truncate max-w-full text-[10px] text-white/62">
                    {currentTrack.artists.map((a) => a.name).join(', ')}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-white/48 font-mono">Nothing playing</p>
              )}
            </div>

            {/* Mobile-only compact transport (like + play/pause + next) */}
            <div className="flex sm:hidden items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <LikeButton track={currentTrack} size={18} className="px-1" />
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={!currentTrack}
                className="h-9 w-9 rounded-full flex items-center justify-center text-white disabled:opacity-30"
              >
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button
                onClick={playNext}
                disabled={!currentTrack}
                className="h-9 w-9 rounded-full flex items-center justify-center text-white/80 disabled:opacity-30"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>

            {/* Center: transport + progress — desktop only */}
            <div className="hidden sm:flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleShuffle}
                  title="Shuffle"
                  className={`transition-colors ${shuffle ? 'text-[#00b4b4]' : 'text-white/55 hover:text-white/85'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
                  </svg>
                </button>

                <button
                  onClick={playPrev}
                  disabled={!currentTrack}
                  className="text-white/62 hover:text-white/80 transition-colors disabled:opacity-20"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                  </svg>
                </button>

                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={!currentTrack}
                  className={`h-9 w-9 rounded-full border flex items-center justify-center transition-all ${
                    currentTrack
                      ? 'border-white/40 hover:border-white hover:bg-white hover:text-black text-white'
                      : 'border-white/10 text-white/48'
                  }`}
                >
                  {isPlaying ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 1 }}>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={playNext}
                  disabled={!currentTrack}
                  className="text-white/62 hover:text-white/80 transition-colors disabled:opacity-20"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                  </svg>
                </button>

                <div className="w-[14px]" />
              </div>

              <ProgressBar position={position} duration={duration} onSeek={setPosition} />
            </div>

            {/* Right: visualizer + grouped controls + volume — desktop only */}
            <div className="hidden sm:flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {/* Visualizer toggle — turn the bar all-business, or bring the
                  waveform back. Wide screens only, matching the visualizer. */}
              <button
                onClick={() => update({ barVisualizer: !settings.barVisualizer })}
                title={settings.barVisualizer ? 'Hide visualizer' : 'Show visualizer'}
                aria-pressed={settings.barVisualizer}
                className={`hidden lg:grid place-items-center h-9 w-9 rounded-full transition-colors ${
                  settings.barVisualizer
                    ? 'text-[#00b4b4] bg-[#00b4b4]/15'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/10'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="10" width="3" height="10" rx="1.2" />
                  <rect x="10.5" y="4" width="3" height="16" rx="1.2" />
                  <rect x="17" y="13" width="3" height="7" rx="1.2" />
                </svg>
              </button>

              {/* Visualizer — decorative, on wide screens only, only when enabled. */}
              {settings.barVisualizer && (
                <button
                  onClick={cycleVisualizer}
                  title="Click to change the visualizer"
                  className="h-9 w-40 mx-1 overflow-hidden hidden lg:block opacity-90 hover:opacity-100 active:scale-[0.98] transition-all"
                >
                  <Equalizer
                    isPlaying={isPlaying}
                    trackId={currentTrack?.id}
                    theme={settings.theme}
                    style={settings.style}
                    barCount={26}
                    className="h-full w-full pointer-events-none"
                  />
                </button>
              )}

              <span className="hidden lg:block w-px h-5 bg-white/10 mx-1" />

              {/* Track actions */}
              <LikeButton
                track={currentTrack}
                size={18}
                className="h-9 w-9 justify-center rounded-full hover:bg-white/10"
              />
              <button
                onClick={() => share(currentTrack)}
                disabled={!currentTrack}
                title="Share this song"
                className="grid place-items-center h-9 w-9 rounded-full text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors disabled:opacity-25 disabled:hover:bg-transparent"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" />
                </svg>
              </button>

              <span className="w-px h-5 bg-white/10 mx-1" />

              {/* Panels */}
              <button
                onClick={toggleQueue}
                title="Queue"
                aria-pressed={showQueue}
                className={`grid place-items-center h-9 w-9 rounded-full transition-colors ${
                  showQueue ? 'text-[#00b4b4] bg-[#00b4b4]/15' : 'text-white/60 hover:text-white/90 hover:bg-white/10'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h13M3 12h13M3 18h7" />
                  <path d="M16 14v6.5" />
                  <circle cx="19" cy="20.5" r="2.4" fill="currentColor" stroke="none" />
                </svg>
              </button>

              <button
                onClick={toggleLyrics}
                title="Lyrics"
                aria-pressed={showLyrics}
                className={`grid place-items-center h-9 w-9 rounded-full transition-colors ${
                  showLyrics ? 'text-[#00b4b4] bg-[#00b4b4]/15' : 'text-white/60 hover:text-white/90 hover:bg-white/10'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
              </button>

              <span className="w-px h-5 bg-white/10 mx-1" />

              <VolumeControl volume={volume} onVolumeChange={setVolume} />
            </div>
          </div>
        </div>
      </m.div>
    </>
  );
}
