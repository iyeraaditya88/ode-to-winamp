'use client';

import { useEffect, useRef, useState } from 'react';
import { useLikedSongs } from './useLikedSongs';
import { aggregate, type ArtistTags, type TasteProfile } from '@/lib/genres';

const CACHE_KEY = 'otw_taste_v1';
const TOP_ARTISTS = 75; // profile the most-liked artists (covers the taste, fast)
const CHUNK = 10; // artists per /api/genres call (under the serverless timeout)

type Phase = 'idle' | 'library' | 'genres' | 'done';

interface Cached {
  total: number;
  analyzed: number;
  profile: TasteProfile;
}

/**
 * Builds the user's genre taste profile: aggregates liked-songs artists, fetches
 * their Last.fm tags (chunked, with progress), folds them into macro genres, and
 * caches the result so reopening is instant. Runs only while `enabled`.
 */
export function useMusicTaste(enabled: boolean) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useLikedSongs();
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [analyzed, setAnalyzed] = useState(0);
  const [notConfigured, setNotConfigured] = useState(false);
  const ranRef = useRef(false);

  const total = data?.pages[0]?.total ?? 0;

  // Pull every liked-songs page so the profile sees the whole library.
  useEffect(() => {
    if (enabled && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [enabled, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Reset so reopening recomputes (cache makes that instant) if a prior run was
  // interrupted by closing the panel mid-compute.
  useEffect(() => {
    if (!enabled) ranRef.current = false;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // NB: `phase` is deliberately NOT in the deps — setting it here must not
    // re-run this effect, or the cleanup would cancel the in-flight fetch loop.
    if (!ranRef.current && hasNextPage) setPhase('library');
    if (ranRef.current || hasNextPage || !data) return;
    ranRef.current = true;
    let cancelled = false;

    (async () => {
      // Cache hit?
      try {
        const cached: Cached | null = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && cached.total === total && cached.profile) {
          setProfile(cached.profile);
          setAnalyzed(cached.analyzed);
          setPhase('done');
          return;
        }
      } catch {
        /* ignore */
      }

      // Rank artists by how many liked tracks they have.
      const counts = new Map<string, { name: string; count: number }>();
      for (const page of data.pages) {
        for (const item of page.items) {
          for (const ar of item.track.artists) {
            if (!ar.id) continue;
            const e = counts.get(ar.id) ?? { name: ar.name, count: 0 };
            e.count += 1;
            counts.set(ar.id, e);
          }
        }
      }
      const top = Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, TOP_ARTISTS);
      setAnalyzed(top.length);
      setPhase('genres');
      setProgress(0);

      const artistTags: ArtistTags[] = [];
      let done = 0;
      for (let i = 0; i < top.length; i += CHUNK) {
        if (cancelled) return;
        const chunk = top.slice(i, i + CHUNK);
        try {
          const q = chunk.map((c) => c.name).join('|');
          const res = await fetch(`/api/genres?artists=${encodeURIComponent(q)}`);
          if (res.status === 503) {
            setNotConfigured(true);
            setPhase('done');
            return;
          }
          if (res.ok) {
            const { result } = await res.json();
            for (const c of chunk) {
              artistTags.push({ name: c.name, weight: c.count, tags: result?.[c.name] ?? [] });
            }
          }
        } catch {
          /* skip chunk */
        }
        done += chunk.length;
        if (!cancelled) setProgress(done / top.length);
      }
      if (cancelled) return;

      const prof = aggregate(artistTags);
      setProfile(prof);
      setPhase('done');
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ total, analyzed: top.length, profile: prof }));
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasNextPage, data, total]);

  return { profile, phase, progress, analyzed, total, notConfigured };
}
