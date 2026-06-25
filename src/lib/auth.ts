import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { SpotifyTokenResponse } from '@/types/spotify';

const COOKIE_ACCESS = 'sp_access_token';
const COOKIE_REFRESH = 'sp_refresh_token';
const COOKIE_EXPIRES = 'sp_expires_at';

export function getTokensFromCookies() {
  const store = cookies();
  return {
    accessToken: store.get(COOKIE_ACCESS)?.value ?? null,
    refreshToken: store.get(COOKIE_REFRESH)?.value ?? null,
    expiresAt: Number(store.get(COOKIE_EXPIRES)?.value ?? 0),
  };
}

export function isTokenExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt;
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  return res.json();
}

export function setTokenCookies(response: NextResponse, tokens: SpotifyTokenResponse, existingRefreshToken?: string) {
  const expiresAt = Date.now() + tokens.expires_in * 1000 - 60_000;
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  };

  response.cookies.set(COOKIE_ACCESS, tokens.access_token, cookieOpts);
  response.cookies.set(
    COOKIE_REFRESH,
    tokens.refresh_token ?? existingRefreshToken ?? '',
    cookieOpts
  );
  response.cookies.set(COOKIE_EXPIRES, String(expiresAt), cookieOpts);
}

export function clearTokenCookies(response: NextResponse) {
  response.cookies.delete(COOKIE_ACCESS);
  response.cookies.delete(COOKIE_REFRESH);
  response.cookies.delete(COOKIE_EXPIRES);
}

export async function getFreshAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken, expiresAt } = getTokensFromCookies();

  if (!accessToken) return null;
  if (!isTokenExpired(expiresAt)) return accessToken;
  if (!refreshToken) return null;

  try {
    const refreshed = await refreshAccessToken(refreshToken);
    return refreshed.access_token;
  } catch {
    return null;
  }
}
