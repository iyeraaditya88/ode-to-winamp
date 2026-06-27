'use client';

import { useQuery } from '@tanstack/react-query';

/** The signed-in Spotify user's id + display name. */
export function useMe() {
  return useQuery<{ id: string; display_name: string }>({
    queryKey: ['me'],
    queryFn: () => fetch('/api/spotify/me').then((r) => r.json()),
    staleTime: Infinity,
  });
}
