'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { PlaylistTracksPage } from '@/types/spotify';

/** Tracks of a playlist (paginated). Pass a falsy id to disable. */
export function usePlaylistTracks(playlistId: string | null) {
  return useInfiniteQuery({
    queryKey: ['playlist-tracks', playlistId],
    queryFn: async ({ pageParam = 0 }): Promise<PlaylistTracksPage> => {
      const offset = typeof pageParam === 'number' ? pageParam : 0;
      const res = await fetch(`/api/spotify/playlists/${playlistId}/tracks?offset=${offset}&limit=50`);
      if (!res.ok) throw new Error('Failed to fetch playlist tracks');
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (last: PlaylistTracksPage) =>
      last.next ? last.offset + last.limit : undefined,
    staleTime: 30_000,
    enabled: !!playlistId,
  });
}
