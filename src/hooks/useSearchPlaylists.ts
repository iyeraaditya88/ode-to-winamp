'use client';

import { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { SpotifyPlaylist } from '@/types/spotify';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Debounced search of public playlists by name. */
export function useSearchPlaylists() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const { data, isLoading } = useQuery<{ playlists: { items: (SpotifyPlaylist | null)[] } }>({
    queryKey: ['search-playlists', debouncedQuery],
    queryFn: () =>
      fetch(`/api/spotify/search?type=playlist&q=${encodeURIComponent(debouncedQuery)}`).then((r) => r.json()),
    enabled: debouncedQuery.trim().length > 1,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  return {
    query,
    setQuery,
    // Spotify can return null entries in playlist search results — filter them.
    results: (data?.playlists?.items ?? []).filter((p): p is SpotifyPlaylist => !!p),
    isLoading,
  };
}
