import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const limit = searchParams.get('limit') ?? '20';

  if (!q) return NextResponse.json({ tracks: { items: [] } });

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'Spotify API error' }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
