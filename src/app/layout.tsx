import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from '@/components/Providers';
import PlayerBar from '@/components/Player/PlayerBar';
import PWARegister from '@/components/PWARegister';

export const metadata: Metadata = {
  title: 'Ode to Winamp',
  description: 'Your Spotify, your way — a custom music player.',
  applicationName: 'Ode to Winamp',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black',
    title: 'Ode to Winamp',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#080808',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          {children}
          <PlayerBar />
        </Providers>
        <PWARegister />
      </body>
    </html>
  );
}
