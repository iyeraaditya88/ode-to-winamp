'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { PlaylistsPage } from '@/types/spotify';

async function fetchPage({ pageParam = 0 }): Promise<PlaylistsPage> {
  const offset = typeof pageParam === 'number' ? pageParam : 0;
  const res = await fetch(`/api/spotify/playlists?offset=${offset}&limit=50`);
  if (!res.ok) {
    // 401/403 → token lacks the new playlist-read scope (needs re-login).
    throw new Error(res.status === 403 || res.status === 401 ? 'reconnect' : 'Failed to fetch playlists');
  }
  return res.json();
}

/** The current user's playlists (paginated). */
export function usePlaylists(enabled = true) {
  return useInfiniteQuery({
    queryKey: ['playlists'],
    queryFn: fetchPage,
    initialPageParam: 0,
    getNextPageParam: (last: PlaylistsPage) =>
      last.next ? last.offset + last.limit : undefined,
    staleTime: 60_000,
    enabled,
  });
}
