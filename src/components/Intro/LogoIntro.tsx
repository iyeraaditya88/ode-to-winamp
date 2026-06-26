'use client';

import { useEffect, useState } from 'react';
import Logo from '@/components/Logo';

interface LogoIntroProps {
  /** When true, the logo plays its final burst then unmounts. */
  burst: boolean;
  onComplete: () => void;
}

export default function LogoIntro({ burst, onComplete }: LogoIntroProps) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!burst) return;
    // Match the CSS burst duration before removing the overlay.
    const t = setTimeout(() => {
      setDone(true);
      onComplete();
    }, 780);
    return () => clearTimeout(t);
  }, [burst, onComplete]);

  if (done) return null;

  const SIZE = 150;

  return (
    <div className={`intro-overlay ${burst ? 'intro-bursting' : ''}`}>
      <div className="intro-spin">
        <div className="intro-pulse relative" style={{ width: SIZE, height: SIZE }}>
          {/* Soft glow on its own layer — blur here is intentional. */}
          <div className="absolute inset-0" style={{ filter: 'blur(11px)', opacity: 0.55 }} aria-hidden>
            <Logo size={SIZE} glow={false} />
          </div>
          {/* Crisp vector logo on top — no SVG filter, so it stays sharp at any DPI. */}
          <Logo size={SIZE} glow={false} className="relative" />
        </div>
      </div>
      <div className="intro-label">Ode to Winamp</div>
    </div>
  );
}
