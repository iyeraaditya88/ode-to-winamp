'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import LandingPage from '@/components/Landing/LandingPage';

const LogoIntro = dynamic(() => import('@/components/Intro/LogoIntro'), { ssr: false });

function LoginScreen({ error }: { error?: string }) {
  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-md w-full">
        <svg
          className="mx-auto mb-8"
          width="64"
          height="64"
          viewBox="0 0 80 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="40" cy="40" r="38" stroke="#00b4b4" strokeWidth="1.5" opacity="0.3" />
          <circle cx="40" cy="40" r="10" fill="#00b4b4" opacity="0.8" />
          <path
            d="M14 52 L22 28 L30 44 L40 24 L50 44 L58 28 L66 52"
            stroke="#00b4b4"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>

        <h1 className="text-2xl font-light tracking-[0.15em] text-white/90 mb-2 uppercase">
          Ode to Winamp
        </h1>
        <p className="text-sm text-white/30 mb-10 tracking-wide font-mono">
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
          className="inline-flex items-center gap-3 px-8 py-3 border border-white/20 text-white/70 hover:text-white hover:border-white/50 transition-all duration-300 text-sm tracking-widest uppercase font-mono"
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

  const urlError =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('error') ?? undefined
      : undefined;

  return (
    <>
      {!introComplete && <LogoIntro onComplete={() => setIntroComplete(true)} />}
      {introComplete && (
        <>
          {authLoading ? (
            <div className="min-h-screen bg-[#080808]" />
          ) : isAuthenticated ? (
            <LandingPage />
          ) : (
            <LoginScreen error={urlError} />
          )}
        </>
      )}
    </>
  );
}
