'use client';

import Image from 'next/image';
import { usePlayer } from '@/contexts/PlayerContext';
import { useEqualizerSettings, EQ_STYLES, EQ_THEMES } from '@/hooks/useEqualizerSettings';
import ProgressBar from './ProgressBar';
import VolumeControl from './VolumeControl';
import Equalizer from '@/components/Equalizer/Equalizer';
import LyricsPanel from '@/components/Lyrics/LyricsPanel';
import NowPlaying from './NowPlaying';

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    volume,
    shuffle,
    showLyrics,
    setIsPlaying,
    setPosition,
    setVolume,
    toggleLyrics,
    toggleNowPlaying,
    toggleShuffle,
    playNext,
    playPrev,
  } = usePlayer();

  const { settings, update } = useEqualizerSettings();
  const art = currentTrack?.album.images.slice(-1)[0]?.url;

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
      <NowPlaying />

      <div
        onClick={() => {
          if (currentTrack) toggleNowPlaying();
        }}
        title={currentTrack ? 'Expand player' : undefined}
        className={`fixed bottom-0 left-0 right-0 z-30 border-t border-white/5 bg-[#111111]/95 backdrop-blur-md ${
          currentTrack ? 'cursor-pointer' : ''
        }`}
      >
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
                  toggleNowPlaying();
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
                <div className="min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNowPlaying();
                    }}
                    className="block truncate text-xs font-medium text-white/90 hover:text-white text-left"
                  >
                    {currentTrack.name}
                  </button>
                  <p className="truncate text-[10px] text-white/62">
                    {currentTrack.artists.map((a) => a.name).join(', ')}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-white/48 font-mono">Nothing playing</p>
              )}
            </div>

            {/* Mobile-only compact transport (play/pause + next) */}
            <div className="flex sm:hidden items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
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

            {/* Right: equalizer + toggles + volume — desktop only */}
            <div className="hidden sm:flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={cycleVisualizer}
                title="Click to change the visualizer"
                className="h-9 w-44 rounded-sm border border-white/10 bg-black/40 overflow-hidden hidden md:block hover:border-[#00b4b4]/40 active:scale-[0.97] transition-all"
              >
                <Equalizer
                  isPlaying={isPlaying}
                  theme={settings.theme}
                  style={settings.style}
                  barCount={28}
                  className="h-full w-full pointer-events-none"
                />
              </button>

              <button
                onClick={toggleLyrics}
                title="Lyrics"
                className={`transition-colors ${showLyrics ? 'text-[#00b4b4]' : 'text-white/55 hover:text-white/80'}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
              </button>

              <button
                onClick={toggleNowPlaying}
                disabled={!currentTrack}
                title="Expand player"
                className="text-white/55 hover:text-white/80 transition-colors disabled:opacity-20 hidden sm:block"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 14l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <VolumeControl volume={volume} onVolumeChange={setVolume} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
