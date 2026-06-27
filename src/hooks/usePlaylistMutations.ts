'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SpotifyPlaylist } from '@/types/spotify';

/**
 * Create playlists and add/remove tracks. Surfaces `needsReconnect` on 403 so
 * the UI can prompt a one-time re-login for the new playlist-modify scopes.
 */
export function usePlaylistMutations() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const run = useCallback(
    async (url: string, method: 'POST' | 'DELETE', body?: unknown): Promise<boolean | SpotifyPlaylist> => {
      setPending(true);
      setNeedsReconnect(false);
      try {
        const res = await fetch(url, {
          method,
          ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
        });
        if (res.status === 403) {
          setNeedsReconnect(true);
          return false;
        }
        if (!res.ok) return false;
        const json = await res.json().catch(() => ({}));
        return json?.id ? (json as SpotifyPlaylist) : true;
      } catch {
        return false;
      } finally {
        setPending(false);
      }
    },
    []
  );

  const create = useCallback(
    async (name: string): Promise<SpotifyPlaylist | null> => {
      const result = await run('/api/spotify/playlists', 'POST', { name });
      if (typeof result === 'object') {
        qc.invalidateQueries({ queryKey: ['playlists'] });
        return result;
      }
      return null;
    },
    [run, qc]
  );

  const addTrack = useCallback(
    async (playlistId: string, uri: string): Promise<boolean> => {
      const ok = await run(`/api/spotify/playlists/${playlistId}/tracks?uri=${encodeURIComponent(uri)}`, 'POST');
      if (ok) qc.invalidateQueries({ queryKey: ['playlist-tracks', playlistId] });
      return !!ok;
    },
    [run, qc]
  );

  const removeTrack = useCallback(
    async (playlistId: string, uri: string): Promise<boolean> => {
      const ok = await run(`/api/spotify/playlists/${playlistId}/tracks?uri=${encodeURIComponent(uri)}`, 'DELETE');
      if (ok) qc.invalidateQueries({ queryKey: ['playlist-tracks', playlistId] });
      return !!ok;
    },
    [run, qc]
  );

  return { pending, needsReconnect, create, addTrack, removeTrack };
}
