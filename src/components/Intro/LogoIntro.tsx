'use client';

import { useEffect, useState } from 'react';

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
        <div className="intro-pulse relative">
          <svg width="84" height="84" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="40" cy="40" r="38" stroke="#00b4b4" strokeWidth="2" opacity="0.3" />
            <circle cx="40" cy="40" r="28" stroke="#00b4b4" strokeWidth="1" opacity="0.2" />
            <circle cx="40" cy="40" r="10" fill="#00b4b4" opacity="0.9" />
            <path
              d="M14 52 L22 28 L30 44 L40 24 L50 44 L58 28 L66 52"
              stroke="#00b4b4"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(0,180,180,0.18) 0%, transparent 70%)',
              filter: 'blur(10px)',
            }}
          />
        </div>
      </div>
      <div className="intro-label">Ode to Winamp</div>
    </div>
  );
}
