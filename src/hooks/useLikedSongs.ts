'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { LikedSongsPage } from '@/types/spotify';

async function fetchPage({ pageParam = 0 }: { pageParam: unknown }): Promise<LikedSongsPage> {
  const offset = typeof pageParam === 'number' ? pageParam : 0;
  const res = await fetch(`/api/spotify/liked-songs?offset=${offset}&limit=50`);
  if (!res.ok) throw new Error('Failed to fetch liked songs');
  return res.json();
}

export function useLikedSongs() {
  return useInfiniteQuery({
    queryKey: ['liked-songs'],
    queryFn: fetchPage,
    initialPageParam: 0,
    getNextPageParam: (lastPage: LikedSongsPage) =>
      lastPage.next ? lastPage.offset + lastPage.limit : undefined,
    // The grid freezes the pool anyway — don't refetch the whole library in the
    // background on focus/remount.
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
