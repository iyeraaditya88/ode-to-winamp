'use client';

import { useCallback, useState } from 'react';

/**
 * Add a track to the user's Spotify Liked Songs. Surfaces `needsReconnect`
 * when the session lacks the user-library-modify scope (403) so the UI can
 * prompt a one-time re-login.
 */
export function useLikeTrack() {
  const [liked, setLiked] = useState(false);
  const [pending, setPending] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const like = useCallback(async (id: string) => {
    setPending(true);
    setNeedsReconnect(false);
    try {
      const res = await fetch(`/api/spotify/like?id=${id}`, { method: 'PUT' });
      if (res.status === 403) {
        setNeedsReconnect(true);
        return;
      }
      if (res.ok) setLiked(true);
    } catch {
      /* ignore */
    } finally {
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setLiked(false);
    setNeedsReconnect(false);
    setPending(false);
  }, []);

  return { liked, pending, needsReconnect, like, reset };
}
