'use client';

import { useQuery } from '@tanstack/react-query';
import { parseLrc, findCurrentLine } from '@/lib/lrclib';
import type { SpotifyTrack } from '@/types/spotify';
import type { LrcLine } from '@/lib/lrclib';

interface LyricsData {
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export function useLyrics(track: SpotifyTrack | null, positionMs: number) {
  const { data, isLoading } = useQuery<LyricsData>({
    queryKey: ['lyrics', track?.id],
    queryFn: async () => {
      const artist = track!.artists[0]?.name ?? '';
      const title = track!.name;
      const album = track!.album.name;
      const duration = Math.round(track!.duration_ms / 1000);
      const params = new URLSearchParams({ artist, title, album, duration: String(duration) });
      const res = await fetch(`/api/lyrics?${params}`);
      return res.json();
    },
    enabled: !!track,
    staleTime: Infinity,
  });

  // Only highlight when real time-synced lyrics exist. For plain-only tracks we
  // show the words but never a (mis-aligned) moving highlight — none is better.
  const lines: LrcLine[] = data?.syncedLyrics ? parseLrc(data.syncedLyrics) : [];
  const currentLineIndex = lines.length > 0 ? findCurrentLine(lines, positionMs) : -1;

  return {
    lines,
    plainLyrics: data?.plainLyrics ?? null,
    hasSynced: lines.length > 0,
    currentLineIndex,
    isLoading,
  };
}
