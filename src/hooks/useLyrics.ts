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

  const synced: LrcLine[] = data?.syncedLyrics ? parseLrc(data.syncedLyrics) : [];

  // Fallback for tracks that only have plain lyrics (no timestamps): estimate a
  // line highlight by spreading the lines across the track duration. Approximate
  // — there's no real timing data — but gives a karaoke-style moving highlight.
  let lines = synced;
  let isEstimated = false;
  if (synced.length === 0 && data?.plainLyrics && track) {
    const raw = data.plainLyrics.split('\n');
    const dur = track.duration_ms;
    const lead = Math.min(7000, dur * 0.05); // small intro offset before vocals
    const span = Math.max(1, dur - lead);
    lines = raw.map((text, i) => ({
      time: lead + (i / Math.max(1, raw.length)) * span,
      text: text.trim(),
    }));
    isEstimated = true;
  }

  const currentLineIndex = lines.length > 0 ? findCurrentLine(lines, positionMs) : -1;

  return {
    lines,
    plainLyrics: data?.plainLyrics ?? null,
    hasSynced: synced.length > 0,
    isEstimated,
    currentLineIndex,
    isLoading,
  };
}
