'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLikedSongs } from './useLikedSongs';
import { aggregate, type ArtistTags, type TasteProfile } from '@/lib/genres';
import type { SpotifyTrack } from '@/types/spotify';

const CACHE_KEY = 'otw_taste_v3';
const TOP_ARTISTS = 75; // profile the most-liked artists (covers the taste, fast)
const SIMILAR_SOURCES = 20; // top-N artists used as "explore" seeds
const POOL_SIZE = 40; // candidate explore artists kept for refreshing
const PAGE = 5;
const CHUNK = 10; // artists per Last.fm call (under the serverless timeout)

type Phase = 'idle' | 'library' | 'genres' | 'done';

export interface TopArtist {
  name: string;
  count: number;
  cover: string | null;
}
export interface ExploreSeed {
  name: string;
  similarTo: string;
}
export interface ExploreArtist extends ExploreSeed {
  cover: string | null;
}

interface Cached {
  total: number;
  analyzed: number;
  profile: TasteProfile;
  topArtists: TopArtist[];
  topSongs: SpotifyTrack[];
  explorePool: ExploreSeed[];
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

function page(pool: ExploreSeed[], start: number, n: number): ExploreSeed[] {
  if (pool.length <= n) return pool;
  return Array.from({ length: n }, (_, i) => pool[(start + i) % pool.length]);
}

/**
 * Builds the user's taste: genre distribution, top artists, top songs, and a
 * refreshable set of similar artists to explore. Cached so reopening is instant.
 */
export function useMusicTaste(enabled: boolean) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useLikedSongs();
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [topSongs, setTopSongs] = useState<SpotifyTrack[]>([]);
  const [explorePool, setExplorePool] = useState<ExploreSeed[]>([]);
  const [exploreArtists, setExploreArtists] = useState<ExploreArtist[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [analyzed, setAnalyzed] = useState(0);
  const [notConfigured, setNotConfigured] = useState(false);
  const ranRef = useRef(false);
  const offsetRef = useRef(0);

  const total = data?.pages[0]?.total ?? 0;

  useEffect(() => {
    if (enabled && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [enabled, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (!enabled) ranRef.current = false;
  }, [enabled]);

  // Cycle the explore section to the next page of candidates (new each click).
  const refreshExplore = useCallback(async () => {
    if (explorePool.length === 0) return;
    setExploreLoading(true);
    offsetRef.current = (offsetRef.current + PAGE) % explorePool.length;
    const next = page(explorePool, offsetRef.current, PAGE);
    const withCovers = await Promise.all(next.map(async (e) => ({ ...e, cover: await coverFor(e.name) })));
    setExploreArtists(withCovers);
    setExploreLoading(false);
  }, [explorePool]);

  useEffect(() => {
    if (!enabled) return;
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
          setTopSongs(cached.topSongs ?? []);
          setExplorePool(cached.explorePool ?? []);
          setExploreArtists(cached.exploreArtists ?? []);
          offsetRef.current = 0;
          setPhase('done');
          return;
        }
      } catch {
        /* ignore */
      }

      // Rank artists by liked-track count (capture a cover); collect all tracks.
      const counts = new Map<string, { name: string; count: number; cover: string | null }>();
      const allTracks: SpotifyTrack[] = [];
      for (const page2 of data.pages) {
        for (const item of page2.items) {
          allTracks.push(item.track);
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

      // Top songs: by Spotify popularity (closest proxy to "most played" the API
      // exposes); fall back to one track per top artist if popularity is stripped.
      const byPop = [...allTracks].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      let songs = dedupeTracks(byPop).slice(0, 5);
      if ((songs[0]?.popularity ?? 0) === 0) {
        const seen = new Set<string>();
        songs = [];
        for (const a of top) {
          const t = allTracks.find((tr) => !seen.has(tr.id) && tr.artists.some((ar) => ar.name === a.name));
          if (t) {
            songs.push(t);
            seen.add(t.id);
          }
          if (songs.length >= 5) break;
        }
      }

      setAnalyzed(top.length);
      setTopArtists(topFive);
      setTopSongs(songs);
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
            for (const c of chunk) artistTags.push({ name: c.name, weight: c.count, tags: result?.[c.name] ?? [] });
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

      // Explore pool: similar artists not already in the library.
      setExploreLoading(true);
      const librarySet = new Set(ranked.map((a) => a.name.toLowerCase()));
      const seeds = top.slice(0, SIMILAR_SOURCES);
      const sim = new Map<string, { name: string; score: number; similarTo: string; best: number }>();
      for (let i = 0; i < seeds.length; i += CHUNK) {
        if (cancelled) return;
        const chunk = seeds.slice(i, i + CHUNK);
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
      const pool: ExploreSeed[] = Array.from(sim.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, POOL_SIZE)
        .map((e) => ({ name: e.name, similarTo: e.similarTo }));
      offsetRef.current = 0;
      setExplorePool(pool);
      const firstPage: ExploreArtist[] = await Promise.all(
        page(pool, 0, PAGE).map(async (e) => ({ ...e, cover: await coverFor(e.name) }))
      );
      if (cancelled) return;
      setExploreArtists(firstPage);
      setExploreLoading(false);

      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            total,
            analyzed: top.length,
            profile: prof,
            topArtists: topFive,
            topSongs: songs,
            explorePool: pool,
            exploreArtists: firstPage,
          })
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

  return {
    profile,
    topArtists,
    topSongs,
    exploreArtists,
    exploreLoading,
    refreshExplore,
    canRefresh: explorePool.length > PAGE,
    phase,
    progress,
    analyzed,
    total,
    notConfigured,
  };
}

function dedupeTracks(tracks: SpotifyTrack[]): SpotifyTrack[] {
  const seen = new Set<string>();
  const out: SpotifyTrack[] = [];
  for (const t of tracks) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
