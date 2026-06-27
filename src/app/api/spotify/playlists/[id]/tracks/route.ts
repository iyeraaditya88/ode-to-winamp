import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';

type Ctx = { params: { id: string } };

/** GET the tracks of a playlist (paginated). */
export async function GET(request: NextRequest, { params }: Ctx) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const offset = searchParams.get('offset') ?? '0';
  const limit = searchParams.get('limit') ?? '50';

  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${params.id}/tracks?offset=${offset}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}

/** POST add a track to the playlist. Query: ?uri=spotify:track:... */
export async function POST(request: NextRequest, { params }: Ctx) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const uri = new URL(request.url).searchParams.get('uri');
  if (!uri) return NextResponse.json({ error: 'Missing uri' }, { status: 400 });

  const res = await fetch(`https://api.spotify.com/v1/playlists/${params.id}/tracks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [uri] }),
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json({ ok: true });
}

/** DELETE remove a track from the playlist. Query: ?uri=spotify:track:... */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const uri = new URL(request.url).searchParams.get('uri');
  if (!uri) return NextResponse.json({ error: 'Missing uri' }, { status: 400 });

  const res = await fetch(`https://api.spotify.com/v1/playlists/${params.id}/tracks`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracks: [{ uri }] }),
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json({ ok: true });
}
