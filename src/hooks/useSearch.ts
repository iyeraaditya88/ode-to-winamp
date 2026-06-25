'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SpotifyTrack } from '@/types/spotify';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useSearch() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const { data, isLoading } = useQuery<{ tracks: { items: SpotifyTrack[] } }>({
    queryKey: ['search', debouncedQuery],
    queryFn: () =>
      fetch(`/api/spotify/search?q=${encodeURIComponent(debouncedQuery)}&limit=50`).then((r) => r.json()),
    enabled: debouncedQuery.trim().length > 1,
    staleTime: 30_000,
  });

  return {
    query,
    setQuery,
    results: data?.tracks?.items ?? [],
    isLoading,
    isActive: query.trim().length > 0,
  };
}
