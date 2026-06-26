import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';

/** Add (PUT) or remove (DELETE) a track from the user's Liked Songs. */
async function mutate(request: NextRequest, method: 'PUT' | 'DELETE') {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const res = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${id}`, {
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

  const res = await fetch(`https://api.spotify.com/v1/me/tracks/contains?ids=${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return NextResponse.json({ liked: false });
  const [liked] = (await res.json()) as boolean[];
  return NextResponse.json({ liked: !!liked });
}
