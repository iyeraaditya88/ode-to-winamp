import { NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';

/** Current user's id + display name (used to tell which playlists are editable). */
export async function GET() {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  const me = (await res.json()) as { id: string; display_name: string };
  return NextResponse.json({ id: me.id, display_name: me.display_name });
}
