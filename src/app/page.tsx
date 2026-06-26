'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import LandingPage from '@/components/Landing/LandingPage';
import Logo from '@/components/Logo';

const LogoIntro = dynamic(() => import('@/components/Intro/LogoIntro'), { ssr: false });

function LoginScreen({ error }: { error?: string }) {
  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-md w-full">
        <Logo size={72} className="mx-auto mb-8" />

        <h1 className="text-2xl font-light tracking-[0.15em] text-white/90 mb-2 uppercase">
          Ode to Winamp
        </h1>
        <p className="text-sm text-white/55 mb-10 tracking-wide font-mono">
          Your Spotify. Your way.
        </p>

        <div className="h-px w-24 bg-white/10 mx-auto mb-10" />

        {error && (
          <div className="mb-6 text-xs text-red-400/70 font-mono bg-red-500/5 border border-red-500/20 rounded-sm px-4 py-2">
            {error === 'state_mismatch' ? 'Authentication failed. Please try again.' : error}
          </div>
        )}

        <a
          href="/api/auth/login"
          className="inline-flex items-center gap-3 px-8 py-3 border border-white/20 text-white/85 hover:text-white hover:border-white/50 transition-all duration-300 text-sm tracking-widest uppercase font-mono"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="opacity-70">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Connect Spotify
        </a>

        <p className="mt-8 text-xs text-white/15 font-mono">Requires Spotify Premium for playback</p>
      </div>
    </div>
  );
}

export default function Home() {
  const [introComplete, setIntroComplete] = useState(false);
  const [burst, setBurst] = useState(false);
  const [gridReady, setGridReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);

  // Minimum time the logo swirls before it's allowed to burst.
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 1600);
    return () => clearTimeout(t);
  }, []);

  // Hard safety net: force through even if grid never signals ready.
  useEffect(() => {
    const t = setTimeout(() => {
      setBurst(true);
      setIntroComplete(true);
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  const { data: authData, isLoading: authLoading } = useQuery({
    queryKey: ['auth-check'],
    queryFn: async () => {
      const res = await fetch('/api/auth/token');
      if (!res.ok) return { authenticated: false };
      return { authenticated: true };
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const isAuthenticated = authData?.authenticated ?? false;

  // Burst once the logo has swirled long enough AND the content behind it is
  // ready: the WebGL grid has warmed up (authed) or we know it's the login
  // screen (no grid to wait for). This closes the black gap.
  useEffect(() => {
    const contentReady = gridReady || (!authLoading && !isAuthenticated);
    if (minElapsed && contentReady && !burst) setBurst(true);
  }, [minElapsed, gridReady, authLoading, isAuthenticated, burst]);

  const urlError =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('error') ?? undefined
      : undefined;

  return (
    <>
      {/* The grid mounts UNDER the overlay during the swirl so WebGL warms up
          while the (compositor-driven, jank-proof) CSS logo keeps spinning.
          onGridReady tells us the canvas is warm so we can burst seamlessly. */}
      {isAuthenticated && <LandingPage burst={burst} onGridReady={() => setGridReady(true)} />}
      {!authLoading && !isAuthenticated && <LoginScreen error={urlError} />}

      {!introComplete && <LogoIntro burst={burst} onComplete={() => setIntroComplete(true)} />}
    </>
  );
}
