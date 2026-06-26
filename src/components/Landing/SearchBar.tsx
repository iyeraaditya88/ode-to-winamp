'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import type { SpotifyTrack } from '@/types/spotify';

interface SearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  results: SpotifyTrack[];
  isLoading: boolean;
  onPlay: (track: SpotifyTrack) => void;
  currentTrackId?: string;
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function SearchBar({
  isOpen,
  onClose,
  query,
  onQueryChange,
  results,
  isLoading,
  onPlay,
  currentTrackId,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const like = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/spotify/like?id=${id}`, { method: 'PUT' });
      if (res.status === 403) {
        setNeedsReconnect(true);
        return;
      }
      if (res.ok) setLikedIds((s) => new Set(s).add(id));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-40 bg-[#080808]/95 backdrop-blur-md flex flex-col"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <div className="flex items-center border-b border-white/10 px-4 sm:px-8 py-4 sm:py-6">
            <svg className="mr-3 sm:mr-4 text-white/55 shrink-0" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search songs, artists…"
              className="flex-1 min-w-0 bg-transparent text-lg sm:text-2xl text-white placeholder-white/20 outline-none font-light tracking-wide"
            />
            <button
              onClick={onClose}
              className="ml-4 text-white/55 hover:text-white transition-colors text-sm font-mono tracking-widest"
            >
              ESC
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4">
            {isLoading && (
              <div className="flex items-center justify-center py-16 text-white/48 text-sm">
                Searching…
              </div>
            )}

            {!isLoading && query.trim() && results.length === 0 && (
              <div className="flex items-center justify-center py-16 text-white/48 text-sm">
                No results for &ldquo;{query}&rdquo;
              </div>
            )}

            {!query.trim() && (
              <div className="flex items-center justify-center py-16 text-white/10 text-sm">
                Start typing to search your Spotify library
              </div>
            )}

            <div className="space-y-1">
              {results.map((track) => {
                const isActive = track.id === currentTrackId;
                const art = track.album.images[2]?.url ?? track.album.images[0]?.url;
                return (
                  <motion.button
                    key={track.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => {
                      onPlay(track);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-4 p-3 rounded-sm text-left transition-colors hover:bg-white/5 ${isActive ? 'bg-white/[0.07]' : ''}`}
                  >
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-sm bg-white/10">
                      {art && <Image src={art} alt="" fill sizes="40px" className="object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`truncate text-sm font-medium ${isActive ? 'text-[#00b4b4]' : 'text-white/90'}`}>
                        {track.name}
                      </p>
                      <p className="truncate text-xs text-white/62">
                        {track.artists.map((a) => a.name).join(', ')} · {track.album.name}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-white/50 font-mono">
                      {formatDuration(track.duration_ms)}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        like(track.id);
                      }}
                      title="Add to Liked Songs"
                      className={`shrink-0 p-1.5 -mr-1 rounded-full transition-colors ${
                        likedIds.has(track.id)
                          ? 'text-[#00b4b4]'
                          : 'text-white/35 hover:text-white/80'
                      }`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={likedIds.has(track.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {needsReconnect && (
              <a
                href="/api/auth/login"
                className="mt-3 block text-center text-xs text-[#00b4b4] hover:underline font-mono"
              >
                Reconnect Spotify to enable liking →
              </a>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
