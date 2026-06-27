import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const type = searchParams.get('type') === 'playlist' ? 'playlist' : 'track';
  // Development-mode Spotify apps cap /search at 10 results — higher values
  // return 400 "Invalid limit". Clamp so we never exceed the cap.
  const requested = Number(searchParams.get('limit') ?? '10');
  const limit = Math.min(10, Math.max(1, Number.isFinite(requested) ? requested : 10));

  if (!q) return NextResponse.json({ [`${type}s`]: { items: [] } });

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'Spotify API error' }, { status: res.status });
  }

  const data = await res.json();
  const response = NextResponse.json(data);
  // Cache identical repeat searches briefly (per-user; never shared).
  response.headers.set('Cache-Control', 'private, max-age=60');
  return response;
}
