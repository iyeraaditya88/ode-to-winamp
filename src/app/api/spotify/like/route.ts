import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';

// Spotify's Feb 2026 migration replaced the per-type saved-tracks endpoints
// (PUT/DELETE /v1/me/tracks, GET /v1/me/tracks/contains — all now 403 for
// dev-mode apps) with a UNIFIED library API keyed by Spotify URIs:
//   PUT  /v1/me/library            body { uris: ['spotify:track:ID'] }
//   DELETE /v1/me/library          body { uris: ['spotify:track:ID'] }
//   GET  /v1/me/library/contains?uris=spotify:track:ID
const trackUri = (id: string) => `spotify:track:${id}`;

/** Add (PUT) or remove (DELETE) a track from the user's library. */
async function mutate(request: NextRequest, method: 'PUT' | 'DELETE') {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const res = await fetch('https://api.spotify.com/v1/me/library', {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [trackUri(id)] }),
  });

  if (!res.ok) {
    // 403 → the session lacks the user-library-modify scope (needs re-login).
    return NextResponse.json({ error: await res.text() }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}

export const PUT = (req: NextRequest) => mutate(req, 'PUT');
export const DELETE = (req: NextRequest) => mutate(req, 'DELETE');

/** Check whether a track is already in the user's library. */
export async function GET(request: NextRequest) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const res = await fetch(
    `https://api.spotify.com/v1/me/library/contains?uris=${encodeURIComponent(trackUri(id))}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return NextResponse.json({ liked: false });

  // Defensive parse: contains has historically returned an array of booleans
  // aligned to the input; tolerate an object shape too.
  const data = (await res.json()) as unknown;
  let liked = false;
  if (Array.isArray(data)) {
    const first = data[0] as unknown;
    liked =
      typeof first === 'boolean'
        ? first
        : !!(first as { saved?: boolean; in_library?: boolean })?.saved ||
          !!(first as { in_library?: boolean })?.in_library;
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    liked = !!obj[trackUri(id)] || !!obj.contains || !!obj.in_library;
  }
  return NextResponse.json({ liked });
}
