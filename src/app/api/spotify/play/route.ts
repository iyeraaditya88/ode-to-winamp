import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';

export async function PUT(request: NextRequest) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('device_id');
  const body = await request.json();

  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`
    : 'https://api.spotify.com/v1/me/player/play';

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
