import { NextResponse } from 'next/server';
import { clearTokenCookies } from '@/lib/auth';

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL('/', request.url));
  clearTokenCookies(response);
  return response;
}
