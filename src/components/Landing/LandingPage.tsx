'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLikedSongs } from '@/hooks/useLikedSongs';
import { useSearch } from '@/hooks/useSearch';
import { usePlayer } from '@/contexts/PlayerContext';
import SearchBar from './SearchBar';
import RecognizePanel from '@/components/Recognize/RecognizePanel';
import Logo from '@/components/Logo';
import type { SpotifyTrack } from '@/types/spotify';

const PhantomGrid = dynamic(() => import('@/components/Grid/PhantomGrid'), { ssr: false });

const MAX_PREFETCH = 200; // cap how many liked songs feed the grid

interface LandingPageProps {
  burst?: boolean;
  onGridReady?: () => void;
}

export default function LandingPage({ burst = true, onGridReady }: LandingPageProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useLikedSongs();
  const { query, setQuery, results: searchResults, isLoading: searchLoading } = useSearch();
  const { playTrack, currentTrack, deviceId, showNowPlaying } = usePlayer();
  const [searchOpen, setSearchOpen] = useState(false);
  const [recognizeOpen, setRecognizeOpen] = useState(false);
  const [frozenSongs, setFrozenSongs] = useState<SpotifyTrack[] | null>(null);

  // Memoised so a stable array feeds the freeze effect + grid (avoids a fresh
  // identity on every render churning dependent hooks).
  const songs: SpotifyTrack[] = useMemo(
    () => data?.pages.flatMap((p) => p.items.map((i) => i.track)) ?? [],
    [data]
  );

  // Freeze the tile pool once the library is loaded (or at burst, whichever is
  // first). The grid maps tiles via index % length, so a *growing* length would
  // remap every tile and churn textures — the visible pulse. Freezing stops it.
  useEffect(() => {
    if (frozenSongs || songs.length === 0) return;
    if (songs.length >= MAX_PREFETCH || !hasNextPage || burst) {
      setFrozenSongs(songs);
    }
  }, [frozenSongs, songs, hasNextPage, burst]);

  const gridSongs = frozenSongs ?? songs;

  // Eagerly pull more pages so the grid has a rich pool — but stop once frozen.
  useEffect(() => {
    if (!frozenSongs && hasNextPage && !isFetchingNextPage && songs.length < MAX_PREFETCH) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, songs.length, fetchNextPage, frozenSongs]);

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

  // Stable identity so the grid's pointer/keyboard listeners (which depend on
  // onPlay) aren't torn down and re-added on every position-tick re-render.
  const handlePlay = useCallback(
    (track: SpotifyTrack) => playTrack(track, gridSongs),
    [playTrack, gridSongs]
  );

  // Playing from search queues the search results, so Next/Prev keep exploring
  // the results rather than jumping back to the liked-songs grid.
  const handlePlaySearch = useCallback(
    (track: SpotifyTrack) => playTrack(track, searchResults.length > 0 ? searchResults : [track]),
    [playTrack, searchResults]
  );

  const total = data?.pages[0]?.total ?? 0;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#080808]">
      {/* WebGL draggable sphere grid lives at z-0 behind everything */}
      {gridSongs.length > 0 && (
        <PhantomGrid
          songs={gridSongs}
          onPlay={handlePlay}
          currentTrackId={currentTrack?.id}
          burst={burst}
          onReady={onGridReady}
          paused={showNowPlaying}
        />
      )}

      <header className="absolute top-0 left-0 right-0 z-30" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size={26} glow={false} />
            <span className="text-sm font-mono tracking-[0.2em] text-white/80 uppercase">
              Ode to Winamp
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {total > 0 && (
              <span className="text-xs text-white/50 font-mono hidden md:inline">{total} liked songs</span>
            )}
            <button
              onClick={() => setRecognizeOpen(true)}
              aria-label="Identify a song"
              title="Identify a song playing"
              className="flex items-center justify-center px-2.5 py-1.5 rounded-sm border border-white/10 bg-black/30 backdrop-blur-sm text-white/62 hover:text-[#00b4b4] hover:border-[#00b4b4]/40 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-sm border border-white/10 bg-black/30 backdrop-blur-sm text-white/62 hover:text-white/85 hover:border-white/20 transition-colors text-xs font-mono"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <span className="hidden sm:inline">Search <span className="text-white/48">/</span></span>
            </button>
            <a
              href="/api/auth/logout"
              className="text-xs text-white/48 hover:text-white/68 transition-colors font-mono whitespace-nowrap"
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
            <p className="text-xs text-white/55 font-mono tracking-widest uppercase">Loading your library</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center text-white/55 text-sm">
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
        onPlay={handlePlaySearch}
        currentTrackId={currentTrack?.id}
      />

      <RecognizePanel
        isOpen={recognizeOpen}
        onClose={() => setRecognizeOpen(false)}
        onSearch={(q) => {
          setRecognizeOpen(false);
          setQuery(q);
          setSearchOpen(true);
        }}
      />
    </div>
  );
}
