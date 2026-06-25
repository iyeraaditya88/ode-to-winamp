import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isSpotifyRoute = path.startsWith('/api/spotify') || path.startsWith('/api/lyrics');

  if (isSpotifyRoute) {
    const hasToken = request.cookies.has('sp_access_token');
    if (!hasToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/spotify/:path*', '/api/lyrics'],
};
