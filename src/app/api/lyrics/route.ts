import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get('artist') ?? '';
  const title = searchParams.get('title') ?? '';
  const album = searchParams.get('album') ?? '';
  const duration = searchParams.get('duration') ?? '';

  const params = new URLSearchParams({
    artist_name: artist,
    track_name: title,
    album_name: album,
    duration,
  });

  try {
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { 'User-Agent': 'OdeToWinamp/1.0 (https://github.com/ode-to-winamp)' },
      next: { revalidate: 86400 },
    });

    if (res.status === 404) {
      return NextResponse.json({ plainLyrics: null, syncedLyrics: null });
    }

    if (!res.ok) {
      return NextResponse.json({ error: 'Lyrics not found' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({
      plainLyrics: data.plainLyrics ?? null,
      syncedLyrics: data.syncedLyrics ?? null,
    });
  } catch {
    return NextResponse.json({ plainLyrics: null, syncedLyrics: null });
  }
}
