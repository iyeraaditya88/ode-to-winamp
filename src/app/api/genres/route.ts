import { NextRequest, NextResponse } from 'next/server';

// Spotify gives our dev-mode app no genre data, so genres come from Last.fm's
// crowd-sourced artist tags. Client sends a small chunk of artist names
// (?artists=name1|name2|…, <=10 to stay under the serverless timeout); we fetch
// each artist's top tags concurrently and return { name: [{tag, weight}] }.

const LASTFM = 'https://ws.audioscrobbler.com/2.0/';

async function topTagsFor(name: string, key: string): Promise<{ tag: string; weight: number }[]> {
  const url =
    `${LASTFM}?method=artist.gettoptags&artist=${encodeURIComponent(name)}` +
    `&api_key=${key}&format=json&autocorrect=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    const tags = data?.toptags?.tag;
    if (!Array.isArray(tags)) return [];
    return tags
      .slice(0, 8)
      .map((t: { name?: string; count?: number }) => ({
        tag: String(t.name ?? ''),
        weight: Number(t.count ?? 0),
      }))
      .filter((t: { tag: string }) => t.tag);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const key = process.env.LASTFM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const raw = new URL(request.url).searchParams.get('artists') ?? '';
  const names = raw
    .split('|')
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (names.length === 0) return NextResponse.json({ result: {} });

  const entries = await Promise.all(names.map(async (n) => [n, await topTagsFor(n, key)] as const));
  const result: Record<string, { tag: string; weight: number }[]> = {};
  for (const [name, tags] of entries) result[name] = tags;

  const response = NextResponse.json({ result });
  response.headers.set('Cache-Control', 'private, max-age=86400');
  return response;
}
