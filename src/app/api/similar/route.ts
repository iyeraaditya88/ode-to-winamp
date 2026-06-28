import { NextRequest, NextResponse } from 'next/server';

// "Explore next" recommendations come from Last.fm's artist.getSimilar (Spotify's
// recommendations endpoint is dead for our dev-mode app). Same chunked shape as
// /api/genres: ?artists=name1|name2|… (<=10) → { name: [{ name, match }] }.

const LASTFM = 'https://ws.audioscrobbler.com/2.0/';

async function similarFor(name: string, key: string): Promise<{ name: string; match: number }[]> {
  const url =
    `${LASTFM}?method=artist.getsimilar&artist=${encodeURIComponent(name)}` +
    `&api_key=${key}&format=json&autocorrect=1&limit=12`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    const artists = data?.similarartists?.artist;
    if (!Array.isArray(artists)) return [];
    return artists
      .map((a: { name?: string; match?: string | number }) => ({
        name: String(a.name ?? ''),
        match: Number(a.match ?? 0),
      }))
      .filter((a: { name: string }) => a.name);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const key = process.env.LASTFM_API_KEY;
  if (!key) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const names = (new URL(request.url).searchParams.get('artists') ?? '')
    .split('|')
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (names.length === 0) return NextResponse.json({ result: {} });

  const entries = await Promise.all(names.map(async (n) => [n, await similarFor(n, key)] as const));
  const result: Record<string, { name: string; match: number }[]> = {};
  for (const [name, sim] of entries) result[name] = sim;

  const response = NextResponse.json({ result });
  response.headers.set('Cache-Control', 'private, max-age=86400');
  return response;
}
