'use client';

import { useQuery } from '@tanstack/react-query';
import { parseLrc, findCurrentLine } from '@/lib/lrclib';
import type { SpotifyTrack } from '@/types/spotify';
import type { LrcLine } from '@/lib/lrclib';

interface LyricsData {
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

// Persist found lyrics so replaying a song shows them instantly (no spinner).
function readLyricsCache(id?: string): LyricsData | undefined {
  if (!id || typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(`otw_lyrics_${id}`);
    return raw ? (JSON.parse(raw) as LyricsData) : undefined;
  } catch {
    return undefined;
  }
}
function writeLyricsCache(id: string, data: LyricsData) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`otw_lyrics_${id}`, JSON.stringify(data));
  } catch {
    /* quota — ignore */
  }
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
      const json: LyricsData = await res.json();
      // Only cache when something was actually found (so empty results can be
      // retried later if lrclib gains the lyrics).
      if (track && (json.syncedLyrics || json.plainLyrics)) writeLyricsCache(track.id, json);
      return json;
    },
    enabled: !!track,
    staleTime: Infinity,
    initialData: () => readLyricsCache(track?.id),
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
