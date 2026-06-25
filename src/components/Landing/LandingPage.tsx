'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLikedSongs } from '@/hooks/useLikedSongs';
import { useSearch } from '@/hooks/useSearch';
import { usePlayer } from '@/contexts/PlayerContext';
import SearchBar from './SearchBar';
import type { SpotifyTrack } from '@/types/spotify';

const PhantomGrid = dynamic(() => import('@/components/Grid/PhantomGrid'), { ssr: false });

const MAX_PREFETCH = 300; // cap how many liked songs feed the grid

export default function LandingPage({ burst = true }: { burst?: boolean }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useLikedSongs();
  const { query, setQuery, results: searchResults, isLoading: searchLoading } = useSearch();
  const { playTrack, currentTrack, deviceId } = usePlayer();
  const [searchOpen, setSearchOpen] = useState(false);

  const songs: SpotifyTrack[] = data?.pages.flatMap((p) => p.items.map((i) => i.track)) ?? [];

  // Eagerly pull more pages so the infinite grid has a rich pool of tiles.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && songs.length < MAX_PREFETCH) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, songs.length, fetchNextPage]);

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
    <div className="relative h-screen w-screen overflow-hidden bg-[#080808]">
      {/* WebGL draggable sphere grid lives at z-0 behind everything */}
      {songs.length > 0 && (
        <PhantomGrid songs={songs} onPlay={handlePlay} currentTrackId={currentTrack?.id} burst={burst} />
      )}

      <header className="absolute top-0 left-0 right-0 z-30">
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
              <span className="text-xs text-white/25 font-mono hidden sm:inline">{total} liked songs</span>
            )}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-white/10 bg-black/30 backdrop-blur-sm text-white/40 hover:text-white/70 hover:border-white/20 transition-colors text-xs font-mono"
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

      {!deviceId && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 rounded-sm border border-[#00b4b4]/20 bg-black/50 backdrop-blur-sm px-4 py-2 text-xs text-[#00b4b4]/70 font-mono">
          Initializing player…
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-[#00b4b4] animate-spin" />
            <p className="text-xs text-white/30 font-mono tracking-widest uppercase">Loading your library</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center text-white/30 text-sm">
          Failed to load liked songs.{' '}
          <a href="/api/auth/login" className="ml-2 text-[#00b4b4] hover:underline">
            Reconnect Spotify
          </a>
        </div>
      )}

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
