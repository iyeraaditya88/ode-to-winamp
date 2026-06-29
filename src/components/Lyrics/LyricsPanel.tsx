'use client';

import { useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useLyrics } from '@/hooks/useLyrics';
import { useRomanize } from '@/hooks/useRomanize';
import { hasNonLatin } from '@/lib/romanize';
import { scrollLineIntoView } from '@/lib/scrollLine';
import type { SpotifyTrack } from '@/types/spotify';

interface LyricsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  track: SpotifyTrack | null;
  positionMs: number;
}

export default function LyricsPanel({ isOpen, onClose, track, positionMs }: LyricsPanelProps) {
  const { lines, plainLyrics, hasSynced, currentLineIndex, isLoading } = useLyrics(track, positionMs);
  const { enabled: romanized, toggle: toggleRomanize, tx } = useRomanize();
  const activeRef = useRef<HTMLDivElement>(null);

  const needsRomanize = hasNonLatin(
    hasSynced ? lines.map((l) => l.text).join(' ') : plainLyrics ?? ''
  );

  useEffect(() => {
    if (hasSynced && activeRef.current) {
      scrollLineIntoView(activeRef.current);
    }
  }, [currentLineIndex, hasSynced]);

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed right-0 top-0 bottom-20 z-40 w-80 max-w-[88vw] border-l border-white/5 bg-[#0d0d0d]/95 backdrop-blur-md flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono tracking-widest text-white/62 uppercase">Lyrics</span>
              {needsRomanize && (hasSynced || plainLyrics) && (
                <button
                  onClick={toggleRomanize}
                  title="Romanize lyrics"
                  className={`px-1.5 py-0.5 rounded-sm border text-[9px] font-mono tracking-wider uppercase transition-colors ${
                    romanized ? 'border-[#00b4b4]/50 text-[#00b4b4]' : 'border-white/15 text-white/55 hover:text-white/80'
                  }`}
                >
                  {romanized ? 'Original' : 'Aa'}
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-white/55 hover:text-white/85 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {track && (
            <div className="px-5 py-3 border-b border-white/5">
              <p className="text-xs font-medium text-white/85 truncate">{track.name}</p>
              <p className="text-xs text-white/55 truncate mt-0.5">
                {track.artists.map((a) => a.name).join(', ')}
              </p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
            {!track && (
              <p className="text-xs text-white/48 font-mono text-center py-8">
                Play a song to see lyrics
              </p>
            )}

            {track && isLoading && (
              <div className="py-6">
                <p className="text-xs text-[#00b4b4]/70 font-mono tracking-wide mb-4 animate-pulse">
                  Getting the words to the tune…
                </p>
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-3 rounded bg-white/5 animate-pulse"
                      style={{ width: `${50 + ((i * 37) % 40)}%` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {track && !isLoading && !hasSynced && !plainLyrics && (
              <p className="text-xs text-white/48 font-mono text-center py-8">
                No lyrics found
              </p>
            )}

            {hasSynced && (
              <div className="space-y-2">
                {lines.map((line, i) => {
                  const isActive = i === currentLineIndex;
                  const isNext = i === currentLineIndex + 1;
                  const isPast = i < currentLineIndex;
                  return (
                    <div
                      key={i}
                      ref={isActive ? activeRef : null}
                      style={isActive ? { textShadow: '0 0 18px rgba(0,180,180,0.35)' } : undefined}
                      className={`border-l-2 pl-3 py-0.5 leading-relaxed transition-all duration-300 ${
                        isActive
                          ? 'border-[#00b4b4] text-white font-semibold text-lg'
                          : isNext
                          ? 'border-transparent text-white/70 text-sm'
                          : isPast
                          ? 'border-transparent text-white/25 text-sm'
                          : 'border-transparent text-white/45 text-sm'
                      }`}
                    >
                      {line.text ? tx(line.text) : <span className="text-white/15">·</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Plain lyrics (no timestamps) — static, never highlighted. */}
            {!hasSynced && plainLyrics && (
              <div className="space-y-2">
                {plainLyrics.split('\n').map((line, i) => (
                  <p key={i} className="text-sm leading-relaxed text-white/70">
                    {line ? tx(line) : <span className="text-white/15">·</span>}
                  </p>
                ))}
              </div>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
