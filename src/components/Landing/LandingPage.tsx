'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useLikedSongs } from '@/hooks/useLikedSongs';
import { useSearch } from '@/hooks/useSearch';
import { usePlayer } from '@/contexts/PlayerContext';
import SongCard from './SongCard';
import SearchBar from './SearchBar';
import type { SpotifyTrack } from '@/types/spotify';

const containerVariant = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export default function LandingPage() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useLikedSongs();
  const { query, setQuery, results: searchResults, isLoading: searchLoading } = useSearch();
  const { playTrack, currentTrack, deviceId } = usePlayer();
  const [searchOpen, setSearchOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const songs: SpotifyTrack[] = data?.pages.flatMap((p) => p.items.map((i) => i.track)) ?? [];

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !searchOpen && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const handlePlay = (track: SpotifyTrack) => {
    playTrack(track, songs);
  };

  const total = data?.pages[0]?.total ?? 0;

  return (
    <div className="min-h-screen bg-[#080808] pb-24">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#080808]/80 backdrop-blur-md">
        <div className="mx-auto max-w-screen-2xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 80 80" fill="none">
              <circle cx="40" cy="40" r="38" stroke="#00b4b4" strokeWidth="2" opacity="0.4" />
              <circle cx="40" cy="40" r="10" fill="#00b4b4" opacity="0.9" />
              <path d="M14 52 L22 28 L30 44 L40 24 L50 44 L58 28 L66 52" stroke="#00b4b4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <span className="text-sm font-mono tracking-[0.2em] text-white/60 uppercase">
              Ode to Winamp
            </span>
          </div>

          <div className="flex items-center gap-4">
            {total > 0 && (
              <span className="text-xs text-white/25 font-mono">{total} liked songs</span>
            )}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors text-xs font-mono"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              Search <span className="text-white/20">/</span>
            </button>
            <a
              href="/api/auth/logout"
              className="text-xs text-white/20 hover:text-white/50 transition-colors font-mono"
            >
              Sign out
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-6 pt-8">
        {!deviceId && (
          <div className="mb-6 rounded-sm border border-[#00b4b4]/20 bg-[#00b4b4]/5 px-4 py-3 text-xs text-[#00b4b4]/70 font-mono">
            Initializing player… Open Spotify on another device to ensure Premium is active.
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-sm bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-24 text-white/30 text-sm">
            Failed to load liked songs.{' '}
            <a href="/api/auth/login" className="ml-2 text-[#00b4b4] hover:underline">
              Reconnect Spotify
            </a>
          </div>
        )}

        {!isLoading && songs.length > 0 && (
          <motion.div
            variants={containerVariant}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
          >
            {songs.map((track, i) => (
              <SongCard
                key={`${track.id}-${i}`}
                track={track}
                index={i}
                isPlaying={currentTrack?.id === track.id}
                onPlay={handlePlay}
              />
            ))}
          </motion.div>
        )}

        <div ref={sentinelRef} className="h-1" />

        {isFetchingNextPage && (
          <div className="flex justify-center py-8">
            <div className="h-1 w-24 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-[#00b4b4]/50 rounded-full animate-pulse" />
            </div>
          </div>
        )}
      </main>

      <SearchBar
        isOpen={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          setQuery('');
        }}
        query={query}
        onQueryChange={setQuery}
        results={searchResults}
        isLoading={searchLoading}
        onPlay={handlePlay}
        currentTrackId={currentTrack?.id}
      />
    </div>
  );
}
