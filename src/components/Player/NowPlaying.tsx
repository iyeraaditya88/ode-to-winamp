'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, useTransform, animate, type MotionValue } from 'framer-motion';
import { usePlayer } from '@/contexts/PlayerContext';
import { useLyrics } from '@/hooks/useLyrics';
import { useShareTrack } from '@/hooks/useShareTrack';
import { useRomanize } from '@/hooks/useRomanize';
import { hasNonLatin } from '@/lib/romanize';
import { useEqualizerSettings, EQ_THEMES, EQ_STYLES } from '@/hooks/useEqualizerSettings';
import ProgressBar from './ProgressBar';
import VolumeControl from './VolumeControl';
import Equalizer from '@/components/Equalizer/Equalizer';
import ClassicWinamp from './ClassicWinamp';

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const SHEET_SPRING = { type: 'spring', stiffness: 360, damping: 38 } as const;

interface NowPlayingProps {
  progress: MotionValue<number>;
  onCollapse: () => void;
}

export default function NowPlaying({ progress, onCollapse }: NowPlayingProps) {
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
    playTrack,
    upcoming,
  } = usePlayer();

  // Sheet follows the shared progress value (0 collapsed → 1 expanded).
  const sheetY = useTransform(progress, [0, 1], ['100%', '0%']);
  const sheetOpacity = useTransform(progress, [0, 0.2], [0, 1]);
  const headerStart = useRef(0);

  const { settings, update } = useEqualizerSettings();
  const { lines, plainLyrics, hasSynced, currentLineIndex, isLoading } = useLyrics(currentTrack, position);
  const { share, copied } = useShareTrack();
  const { enabled: romanized, toggle: toggleRomanize, tx } = useRomanize();
  const activeRef = useRef<HTMLDivElement>(null);

  const needsRomanize = hasNonLatin(
    hasSynced ? lines.map((l) => l.text).join(' ') : plainLyrics ?? ''
  );

  useEffect(() => {
    if (hasSynced && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentLineIndex, hasSynced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCollapse();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCollapse]);

  const art = currentTrack?.album.images[0]?.url;
  const nextUp = upcoming();
  const [classic, setClassic] = useState(false);

  // Lyrics content, shared between the modern and classic layouts.
  const lyricsScroll = (
    <>
      {!currentTrack && <p className="text-sm text-white/48 font-mono">Play a song to see lyrics</p>}

      {currentTrack && isLoading && (
        <p className="text-sm text-[#00b4b4]/70 font-mono animate-pulse">Getting the words to the tune…</p>
      )}

      {currentTrack && !isLoading && !hasSynced && !plainLyrics && (
        <p className="text-sm text-white/48 font-mono">No lyrics found for this track</p>
      )}

      {needsRomanize && (hasSynced || plainLyrics) && (
        <button
          onClick={toggleRomanize}
          className={`mb-4 px-2.5 py-1 rounded-sm border text-[10px] font-mono tracking-widest uppercase transition-colors ${
            romanized
              ? 'border-[#00b4b4]/50 text-[#00b4b4]'
              : 'border-white/15 text-white/55 hover:text-white/80'
          }`}
        >
          {romanized ? 'Original' : 'Romanize'}
        </button>
      )}

      {hasSynced && (
        <div className="space-y-3 sm:space-y-4">
          {lines.map((line, i) => {
            const active = i === currentLineIndex;
            const next = i === currentLineIndex + 1;
            const past = i < currentLineIndex;
            return (
              <div
                key={i}
                ref={active ? activeRef : null}
                style={active ? { textShadow: '0 0 26px rgba(0,180,180,0.35)' } : undefined}
                className={`border-l-2 pl-4 leading-snug transition-all duration-300 ${
                  active
                    ? 'border-[#00b4b4] text-white text-2xl sm:text-3xl font-bold'
                    : next
                    ? 'border-transparent text-white/70 text-lg sm:text-xl'
                    : past
                    ? 'border-transparent text-white/25 text-lg'
                    : 'border-transparent text-white/45 text-lg'
                }`}
              >
                {line.text ? tx(line.text) : <span className="text-white/15">♪</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Plain lyrics (no timestamps) — shown statically, never highlighted. */}
      {!hasSynced && plainLyrics && (
        <div className="space-y-3 sm:space-y-4">
          {plainLyrics.split('\n').map((line, i) => (
            <p key={i} className="text-lg leading-snug text-white/70">
              {line ? tx(line) : <span className="text-white/15">♪</span>}
            </p>
          ))}
        </div>
      )}
    </>
  );

  return (
        <motion.div
          style={{
            y: sheetY,
            opacity: sheetOpacity,
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
          className="fixed inset-0 z-50 flex flex-col bg-[#070707]"
        >
          {/* Blurred album-art backdrop */}
          {art && (
            <div className="absolute inset-0 -z-10 overflow-hidden">
              <Image src={art} alt="" fill className="object-cover scale-110 opacity-25 blur-3xl" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black" />
            </div>
          )}

          {/* Header doubles as the drag handle — pull down to collapse; the
              sheet follows the drag via the shared progress value. */}
          <motion.div
            onPanStart={() => {
              headerStart.current = progress.get();
            }}
            onPan={(_e, info) => {
              const p = headerStart.current - info.offset.y / window.innerHeight;
              progress.set(Math.max(0, Math.min(1, p)));
            }}
            onPanEnd={(_e, info) => {
              const p = progress.get();
              const close = info.velocity.y > 350 ? true : info.velocity.y < -350 ? false : p < 0.6;
              if (close) onCollapse();
              else animate(progress, 1, SHEET_SPRING);
            }}
            style={{ touchAction: 'none' }}
            className="shrink-0 select-none cursor-grab active:cursor-grabbing"
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full bg-white/25" />
            </div>
            <div className="flex items-center justify-between px-4 sm:px-6 py-3">
              <span className="text-xs font-mono tracking-[0.3em] text-white/62 uppercase">Now Playing</span>
            <div className="flex items-center gap-3 sm:gap-5">
              <button
                onClick={() => setClassic((c) => !c)}
                className="text-[10px] sm:text-xs font-mono tracking-widest px-2.5 sm:px-3 py-1.5 rounded-sm border border-[#00b4b4]/40 text-[#00b4b4] hover:bg-[#00b4b4]/10 transition-colors whitespace-nowrap"
              >
                {classic ? 'NEO-CLASSIC' : 'CLASSIC'}
              </button>
              <button
                onClick={() => share(currentTrack)}
                disabled={!currentTrack}
                title="Share this song"
                className="flex items-center gap-2 text-white/62 hover:text-white transition-colors text-xs font-mono tracking-widest disabled:opacity-30"
              >
                {copied ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" />
                  </svg>
                )}
                <span className="hidden sm:inline">{copied ? 'COPIED' : 'SHARE'}</span>
              </button>
              <button
                onClick={onCollapse}
                className="flex items-center gap-2 text-white/62 hover:text-white transition-colors text-xs font-mono tracking-widest"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                CLOSE
              </button>
            </div>
            </div>
          </motion.div>

          {classic ? (
            <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-2 gap-6 lg:gap-8 px-4 sm:px-6 lg:px-12 pb-6 overflow-y-auto lg:overflow-hidden">
              {/* Left: classic Winamp player */}
              <div className="flex justify-center lg:min-h-0 lg:h-full py-2 w-full">
                <ClassicWinamp />
              </div>

              {/* Right: album art + lyrics */}
              <div className="flex flex-col lg:min-h-0 gap-5 shrink-0 w-full">
                <div className="relative w-full max-w-[220px] sm:max-w-xs aspect-square rounded-lg overflow-hidden shadow-2xl mx-auto lg:mx-0">
                  {art ? (
                    <Image src={art} alt={currentTrack?.album.name ?? ''} fill className="object-contain" />
                  ) : (
                    <div className="h-full w-full bg-white/5" />
                  )}
                </div>
                <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                  <span className="block text-xs font-mono tracking-[0.3em] text-white/62 uppercase mb-3">Lyrics</span>
                  {lyricsScroll}
                </div>
              </div>
            </div>
          ) : (
          <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-2 gap-6 lg:gap-8 px-4 sm:px-6 lg:px-12 pb-6 overflow-y-auto lg:overflow-hidden">
            {/* Left: art, controls, equalizer */}
            <div className="flex flex-col items-center gap-5 lg:gap-6 lg:justify-center lg:min-h-0 shrink-0 w-full">
              <div className="relative w-full max-w-[240px] sm:max-w-xs lg:max-w-sm aspect-square rounded-lg overflow-hidden shadow-2xl">
                {art ? (
                  <Image src={art} alt={currentTrack?.album.name ?? ''} fill className="object-contain" />
                ) : (
                  <div className="h-full w-full bg-white/5" />
                )}
                {isPlaying && (
                  <div className="absolute inset-0 ring-1 ring-[#00b4b4]/40 rounded-lg" />
                )}
              </div>

              <div className="text-center w-full max-w-sm">
                <h2 className="text-xl font-semibold text-white truncate">{currentTrack?.name ?? 'Nothing playing'}</h2>
                <p className="text-sm text-white/68 truncate mt-1">
                  {currentTrack?.artists.map((a) => a.name).join(', ')}
                </p>
              </div>

              <div className="w-full max-w-sm flex flex-col gap-4">
                <ProgressBar position={position} duration={duration} onSeek={setPosition} />

                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={toggleShuffle}
                    title="Shuffle"
                    className={`transition-colors ${shuffle ? 'text-[#00b4b4]' : 'text-white/62 hover:text-white/85'}`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
                    </svg>
                  </button>
                  <button onClick={playPrev} className="text-white/80 hover:text-white transition-colors">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="h-12 w-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
                  >
                    {isPlaying ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  <button onClick={playNext} className="text-white/80 hover:text-white transition-colors">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                    </svg>
                  </button>
                  <div className="w-[18px]" />
                </div>

                <div className="flex justify-center">
                  <VolumeControl volume={volume} onVolumeChange={setVolume} />
                </div>
              </div>

              {/* Equalizer + customization */}
              <div className="w-full max-w-md">
                <div className="h-24 w-full rounded-md border border-white/5 bg-black/30 overflow-hidden">
                  <Equalizer
                    isPlaying={isPlaying}
                    theme={settings.theme}
                    style={settings.style}
                    barCount={settings.barCount}
                    className="h-full w-full"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    {EQ_THEMES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => update({ theme: t.id })}
                        title={t.label}
                        className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
                          settings.theme === t.id ? 'border-white scale-110' : 'border-white/20'
                        }`}
                        style={{
                          background:
                            t.stops[0] === 'rainbow'
                              ? 'conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)'
                              : `linear-gradient(135deg, ${t.stops.join(', ')})`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    {EQ_STYLES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => update({ style: s.id })}
                        className={`px-2 py-1 rounded-sm text-[10px] font-mono tracking-wider uppercase transition-colors ${
                          settings.style === s.id
                            ? 'bg-[#00b4b4]/20 text-[#00b4b4]'
                            : 'text-white/55 hover:text-white/80'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: lyrics + queue */}
            <div className="flex flex-col lg:min-h-0 gap-6 shrink-0 w-full">
              <div className="lg:flex-1 lg:min-h-0 flex flex-col">
                <span className="text-xs font-mono tracking-[0.3em] text-white/62 uppercase mb-3">Lyrics</span>
                <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto pr-2">{lyricsScroll}</div>
              </div>

              {/* Queue */}
              {nextUp.length > 0 && (
                <div className="shrink-0 max-h-44 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono tracking-[0.3em] text-white/62 uppercase">
                      Next Up {shuffle && <span className="text-[#00b4b4]">· shuffle</span>}
                    </span>
                    <span className="text-[10px] text-white/50 font-mono">{nextUp.length} queued</span>
                  </div>
                  <div className="overflow-y-auto space-y-1 pr-2">
                    {nextUp.map((t, i) => (
                      <button
                        key={`${t.id}-${i}`}
                        onClick={() => playTrack(t)}
                        className="w-full flex items-center gap-3 p-2 rounded-sm hover:bg-white/5 text-left transition-colors"
                      >
                        <span className="text-[10px] text-white/50 font-mono w-4 text-right">{i + 1}</span>
                        <div className="relative h-8 w-8 shrink-0 rounded-sm overflow-hidden bg-white/10">
                          {t.album.images.slice(-1)[0]?.url && (
                            <Image src={t.album.images.slice(-1)[0].url} alt="" fill className="object-cover" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-white/80">{t.name}</p>
                          <p className="truncate text-[10px] text-white/62">{t.artists.map((a) => a.name).join(', ')}</p>
                        </div>
                        <span className="text-[10px] text-white/50 font-mono">{fmt(t.duration_ms)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </motion.div>
  );
}
