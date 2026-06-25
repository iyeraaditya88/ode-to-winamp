import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import Providers from '@/components/Providers';
import PlayerBar from '@/components/Player/PlayerBar';

export const metadata: Metadata = {
  title: 'Ode to Winamp',
  description: 'Your Spotify, your way.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          {children}
          <PlayerBar />
        </Providers>
        <Script
          src="https://sdk.scdn.co/spotify-player.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
