import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';

// Spotify's 2026 API migration deprecated the `?ids=` / request-body form of the
// saved-tracks endpoints (they now 403). Identifiers must be passed as `uris=`
// in Spotify URI format (e.g. spotify:track:ID).
const trackUri = (id: string) => encodeURIComponent(`spotify:track:${id}`);

/** Add (PUT) or remove (DELETE) a track from the user's Liked Songs. */
async function mutate(request: NextRequest, method: 'PUT' | 'DELETE') {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const res = await fetch(`https://api.spotify.com/v1/me/tracks?uris=${trackUri(id)}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    // 403 → the session lacks the user-library-modify scope (needs re-login).
    return NextResponse.json({ error: await res.text() }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}

export const PUT = (req: NextRequest) => mutate(req, 'PUT');
export const DELETE = (req: NextRequest) => mutate(req, 'DELETE');

/** Check whether a track is already liked. */
export async function GET(request: NextRequest) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const headers = { Authorization: `Bearer ${token}` };
  // Prefer the new uris form; fall back to the legacy ids form for resilience.
  let res = await fetch(
    `https://api.spotify.com/v1/me/tracks/contains?uris=${trackUri(id)}`,
    { headers }
  );
  if (!res.ok) {
    res = await fetch(`https://api.spotify.com/v1/me/tracks/contains?ids=${id}`, { headers });
  }
  if (!res.ok) return NextResponse.json({ liked: false });

  const [liked] = (await res.json()) as boolean[];
  return NextResponse.json({ liked: !!liked });
}
