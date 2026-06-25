import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const offset = searchParams.get('offset') ?? '0';
  const limit = searchParams.get('limit') ?? '50';

  const res = await fetch(
    `https://api.spotify.com/v1/me/tracks?offset=${offset}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'Spotify API error' }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
