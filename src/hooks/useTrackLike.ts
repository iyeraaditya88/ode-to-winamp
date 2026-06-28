'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SpotifyTrack } from '@/types/spotify';

/**
 * Liked-state for a single track, shared across components via react-query
 * (so the PlayerBar heart and the Now Playing heart stay in sync). Exposes a
 * toggle that likes/unlikes with an optimistic flip, and surfaces 403 (the
 * session lacks user-library-modify → needs re-login).
 */
export function useTrackLike(track: SpotifyTrack | null) {
  const qc = useQueryClient();
  const id = track?.id ?? null;
  const [pending, setPending] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const { data: liked = false } = useQuery({
    queryKey: ['liked', id],
    queryFn: () => fetch(`/api/spotify/like?id=${id}`).then((r) => r.json()).then((d) => !!d.liked),
    enabled: !!id,
    staleTime: 60_000,
  });

  const toggle = useCallback(async () => {
    if (!id) return;
    const next = !liked;
    setPending(true);
    setNeedsReconnect(false);
    qc.setQueryData(['liked', id], next); // optimistic
    try {
      const res = await fetch(`/api/spotify/like?id=${id}`, { method: next ? 'PUT' : 'DELETE' });
      if (res.status === 403) {
        setNeedsReconnect(true);
        qc.setQueryData(['liked', id], !next);
      } else if (!res.ok) {
        qc.setQueryData(['liked', id], !next);
      }
    } catch {
      qc.setQueryData(['liked', id], !next);
    } finally {
      setPending(false);
    }
  }, [id, liked, qc]);

  return { liked, toggle, pending, needsReconnect };
}
