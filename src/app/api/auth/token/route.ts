import { NextResponse } from 'next/server';
import { getTokensFromCookies, refreshAccessToken, setTokenCookies } from '@/lib/auth';

export async function GET() {
  const { accessToken, refreshToken, expiresAt } = getTokensFromCookies();

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (Date.now() < expiresAt) {
    return NextResponse.json({ token: accessToken });
  }

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken);
    const response = NextResponse.json({ token: refreshed.access_token });
    setTokenCookies(response, refreshed, refreshToken);
    return response;
  } catch {
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
  }
}
