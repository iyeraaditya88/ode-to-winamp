import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';
import type { SpotifyTrack } from '@/types/spotify';

/**
 * Identify a song from a short mic recording via AudD (audd.io).
 * Receives the audio blob, forwards it to AudD with `return=spotify`, and
 * normalizes the response into our SpotifyTrack shape.
 */
export async function POST(request: NextRequest) {
  const token = process.env.AUDD_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'Recognition not configured' }, { status: 503 });
  }

  let file: FormDataEntryValue | null = null;
  try {
    const incoming = await request.formData();
    file = incoming.get('file');
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
  }

  const audd = new FormData();
  audd.append('api_token', token);
  audd.append('return', 'spotify');
  audd.append('file', file, 'clip');

  let data: AuddResponse;
  try {
    const res = await fetch('https://api.audd.io/', { method: 'POST', body: audd });
    data = (await res.json()) as AuddResponse;
  } catch {
    return NextResponse.json({ error: 'Recognition service error' }, { status: 502 });
  }

  if (data.status !== 'success' || !data.result) {
    return NextResponse.json({ matched: false });
  }

  const r = data.result;
  let track = r.spotify ? normalizeSpotify(r.spotify) : undefined;

  // Fallback: if AudD didn't return a Spotify match, search Spotify ourselves
  // so the result always resolves to a real track (Play + Add to Liked).
  if (!track) {
    const q = [r.artist, r.title].filter(Boolean).join(' ').trim();
    if (q) track = await searchSpotifyTrack(q);
  }

  return NextResponse.json({
    matched: true,
    title: r.title ?? track?.name ?? '',
    artist: r.artist ?? track?.artists[0]?.name ?? '',
    track,
  });
}

async function searchSpotifyTrack(query: string): Promise<SpotifyTrack | undefined> {
  const token = await getFreshAccessToken();
  if (!token) return undefined;
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return undefined;
  const data = await res.json();
  const item = data.tracks?.items?.[0];
  return item ? normalizeSpotify(item) : undefined;
}

interface AuddResponse {
  status: string;
  result: {
    artist?: string;
    title?: string;
    album?: string;
    spotify?: Partial<SpotifyTrack> & Record<string, unknown>;
  } | null;
}

/** AudD's `result.spotify` is the Spotify track JSON — fill any gaps defensively. */
function normalizeSpotify(s: Partial<SpotifyTrack> & Record<string, unknown>): SpotifyTrack | undefined {
  if (!s.id || !s.uri || !s.name) return undefined;
  const album = (s.album ?? {}) as Partial<SpotifyTrack['album']>;
  return {
    id: s.id,
    uri: s.uri,
    name: s.name,
    duration_ms: s.duration_ms ?? 0,
    artists: (s.artists ?? []).map((a) => ({
      id: a.id ?? a.uri ?? '',
      name: a.name ?? '',
      uri: a.uri ?? '',
    })),
    album: {
      id: album.id ?? '',
      name: album.name ?? '',
      images: album.images ?? [],
      uri: album.uri ?? '',
      release_date: album.release_date ?? '',
    },
    explicit: s.explicit ?? false,
    popularity: s.popularity ?? 0,
    preview_url: s.preview_url ?? null,
  };
}
