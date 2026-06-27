import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';

/** GET the current user's playlists (paginated). */
export async function GET(request: NextRequest) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const offset = searchParams.get('offset') ?? '0';
  const limit = searchParams.get('limit') ?? '50';

  const res = await fetch(
    `https://api.spotify.com/v1/me/playlists?offset=${offset}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}

/** POST create a new playlist for the current user. Body: { name }. */
export async function POST(request: NextRequest) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = (await request.json().catch(() => ({}))) as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  // Need the user id to create under their account.
  const meRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) return NextResponse.json({ error: await meRes.text() }, { status: meRes.status });
  const me = (await meRes.json()) as { id: string };

  const res = await fetch(`https://api.spotify.com/v1/users/${me.id}/playlists`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), public: false }),
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}
