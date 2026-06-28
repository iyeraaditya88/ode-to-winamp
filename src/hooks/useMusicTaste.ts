'use client';

import { useEffect, useRef, useState } from 'react';
import { useLikedSongs } from './useLikedSongs';
import { aggregate, type ArtistTags, type TasteProfile } from '@/lib/genres';

const CACHE_KEY = 'otw_taste_v2';
const TOP_ARTISTS = 75; // profile the most-liked artists (covers the taste, fast)
const SIMILAR_SOURCES = 12; // use the top-N artists as seeds for "explore"
const CHUNK = 10; // artists per Last.fm call (under the serverless timeout)

type Phase = 'idle' | 'library' | 'genres' | 'done';

export interface TopArtist {
  name: string;
  count: number;
  cover: string | null;
}
export interface ExploreArtist {
  name: string;
  cover: string | null;
  similarTo: string;
}

interface Cached {
  total: number;
  analyzed: number;
  profile: TasteProfile;
  topArtists: TopArtist[];
  exploreArtists: ExploreArtist[];
}

async function coverFor(name: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(name)}&type=track&limit=1`);
    if (!res.ok) return null;
    const d = await res.json();
    const t = d?.tracks?.items?.[0];
    return t?.album?.images?.[1]?.url ?? t?.album?.images?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Builds the user's taste: genre distribution (Last.fm tags → macro genres), the
 * top artists they like, and similar artists to explore (Last.fm getSimilar,
 * excluding ones already in the library). Cached so reopening is instant.
 */
export function useMusicTaste(enabled: boolean) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useLikedSongs();
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [exploreArtists, setExploreArtists] = useState<ExploreArtist[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
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
          setTopArtists(cached.topArtists ?? []);
          setExploreArtists(cached.exploreArtists ?? []);
          setPhase('done');
          return;
        }
      } catch {
        /* ignore */
      }

      // Rank artists by how many liked tracks they have; capture a cover.
      const counts = new Map<string, { name: string; count: number; cover: string | null }>();
      for (const page of data.pages) {
        for (const item of page.items) {
          const imgs = item.track.album.images;
          const cover = imgs[1]?.url ?? imgs[0]?.url ?? null;
          for (const ar of item.track.artists) {
            if (!ar.id) continue;
            const e = counts.get(ar.id) ?? { name: ar.name, count: 0, cover: null };
            e.count += 1;
            if (!e.cover) e.cover = cover;
            counts.set(ar.id, e);
          }
        }
      }
      const ranked = Array.from(counts.values()).sort((a, b) => b.count - a.count);
      const top = ranked.slice(0, TOP_ARTISTS);
      const topFive: TopArtist[] = top.slice(0, 5).map((a) => ({ name: a.name, count: a.count, cover: a.cover }));
      setAnalyzed(top.length);
      setTopArtists(topFive);
      setPhase('genres');
      setProgress(0);

      // Genre tags (chunked, with progress).
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

      // "Explore next": similar artists not already in the library.
      setExploreLoading(true);
      const librarySet = new Set(ranked.map((a) => a.name.toLowerCase()));
      const sources = top.slice(0, SIMILAR_SOURCES);
      const sim = new Map<string, { name: string; score: number; similarTo: string; best: number }>();
      for (let i = 0; i < sources.length; i += CHUNK) {
        if (cancelled) return;
        const chunk = sources.slice(i, i + CHUNK);
        try {
          const q = chunk.map((c) => c.name).join('|');
          const res = await fetch(`/api/similar?artists=${encodeURIComponent(q)}`);
          if (res.ok) {
            const { result } = await res.json();
            for (const s of chunk) {
              for (const cand of (result?.[s.name] ?? []) as { name: string; match: number }[]) {
                const key = cand.name.toLowerCase();
                if (librarySet.has(key)) continue;
                const sc = (cand.match || 0) * s.count;
                const e = sim.get(key) ?? { name: cand.name, score: 0, similarTo: s.name, best: 0 };
                e.score += sc;
                if (sc > e.best) {
                  e.best = sc;
                  e.similarTo = s.name;
                }
                sim.set(key, e);
              }
            }
          }
        } catch {
          /* skip */
        }
      }
      const explorePicks = Array.from(sim.values()).sort((a, b) => b.score - a.score).slice(0, 5);
      const exploreFive: ExploreArtist[] = await Promise.all(
        explorePicks.map(async (e) => ({ name: e.name, similarTo: e.similarTo, cover: await coverFor(e.name) }))
      );
      if (cancelled) return;
      setExploreArtists(exploreFive);
      setExploreLoading(false);

      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ total, analyzed: top.length, profile: prof, topArtists: topFive, exploreArtists: exploreFive })
        );
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasNextPage, data, total]);

  return { profile, topArtists, exploreArtists, exploreLoading, phase, progress, analyzed, total, notConfigured };
}
