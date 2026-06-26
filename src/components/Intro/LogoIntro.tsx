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

  return (
    <div className={`intro-overlay ${burst ? 'intro-bursting' : ''}`}>
      <div className="intro-spin">
        <div className="intro-pulse">
          <Logo size={96} />
        </div>
      </div>
      <div className="intro-label">Ode to Winamp</div>
    </div>
  );
}
