import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken } from '@/lib/auth';

// Run at the edge POP nearest the listener instead of a single US region, so the
// client→function hop on the hot playback path is ~30ms instead of a cross-
// continent round-trip on every play. The function→Spotify hop and Spotify's own
// buffering still apply, but this removes the avoidable geographic latency.
export const runtime = 'edge';

export async function PUT(request: NextRequest) {
  const token = await getFreshAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('device_id');

  // No body → resume the current playback ON this device (transfers audio here
  // if it was active elsewhere). A body with `uris` → start a specific track.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`
    : 'https://api.spotify.com/v1/me/player/play';

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
