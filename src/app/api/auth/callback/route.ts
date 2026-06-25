import { NextRequest, NextResponse } from 'next/server';
import { setTokenCookies } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const storedState = request.cookies.get('sp_oauth_state')?.value;

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
  }

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(new URL('/?error=state_mismatch', request.url));
  }

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/?error=token_exchange_failed', request.url));
  }

  const tokens = await tokenRes.json();
  const response = NextResponse.redirect(new URL('/', request.url));

  setTokenCookies(response, tokens);
  response.cookies.delete('sp_oauth_state');

  return response;
}
