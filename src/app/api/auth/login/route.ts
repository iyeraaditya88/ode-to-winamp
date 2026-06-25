import { NextResponse } from 'next/server';

const SCOPES = [
  'user-library-read',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-email',
  'user-read-private',
].join(' ');

export async function GET() {
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params}`;
  const response = NextResponse.redirect(authUrl);

  response.cookies.set('sp_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  });

  return response;
}
