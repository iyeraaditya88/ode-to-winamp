'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLyrics } from '@/hooks/useLyrics';
import type { SpotifyTrack } from '@/types/spotify';

interface LyricsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  track: SpotifyTrack | null;
  positionMs: number;
}

export default function LyricsPanel({ isOpen, onClose, track, positionMs }: LyricsPanelProps) {
  const { lines, plainLyrics, hasSynced, currentLineIndex, isLoading } = useLyrics(track, positionMs);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasSynced && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentLineIndex, hasSynced]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed right-0 top-0 bottom-20 z-20 w-80 border-l border-white/5 bg-[#0d0d0d]/95 backdrop-blur-md flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <span className="text-xs font-mono tracking-widest text-white/40 uppercase">Lyrics</span>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/70 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {track && (
            <div className="px-5 py-3 border-b border-white/5">
              <p className="text-xs font-medium text-white/70 truncate">{track.name}</p>
              <p className="text-xs text-white/30 truncate mt-0.5">
                {track.artists.map((a) => a.name).join(', ')}
              </p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
            {!track && (
              <p className="text-xs text-white/20 font-mono text-center py-8">
                Play a song to see lyrics
              </p>
            )}

            {track && isLoading && (
              <div className="space-y-2 py-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-3 rounded bg-white/5 animate-pulse"
                    style={{ width: `${50 + Math.random() * 40}%` }}
                  />
                ))}
              </div>
            )}

            {track && !isLoading && !hasSynced && !plainLyrics && (
              <p className="text-xs text-white/20 font-mono text-center py-8">
                No lyrics found
              </p>
            )}

            {hasSynced && (
              <div className="space-y-1">
                {lines.map((line, i) => {
                  const isActive = i === currentLineIndex;
                  const isPast = i < currentLineIndex;
                  return (
                    <div
                      key={i}
                      ref={isActive ? activeRef : null}
                      className={`py-1 text-sm leading-relaxed transition-all duration-300 ${
                        isActive
                          ? 'text-white font-medium text-base'
                          : isPast
                          ? 'text-white/25'
                          : 'text-white/45'
                      }`}
                    >
                      {line.text || <span className="text-white/10">·</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {!hasSynced && plainLyrics && (
              <pre className="text-xs text-white/50 font-mono leading-relaxed whitespace-pre-wrap">
                {plainLyrics}
              </pre>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
