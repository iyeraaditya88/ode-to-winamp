'use client';

import { useId } from 'react';
import { LOGO_WAVEFORM_D, LOGO_GRADIENT } from './logoPath';

interface LogoProps {
  size?: number;
  glow?: boolean;
  className?: string;
}

/** The Ode to Winamp wordmark — a gradient ring with an audio waveform. */
export default function Logo({ size = 24, glow = true, className = '' }: LogoProps) {
  const raw = useId().replace(/:/g, '');
  const lg = `lg-${raw}`;
  const rg = `rg-${raw}`;
  const gl = `gl-${raw}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={lg} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={LOGO_GRADIENT[0]} />
          <stop offset="0.5" stopColor={LOGO_GRADIENT[1]} />
          <stop offset="1" stopColor={LOGO_GRADIENT[2]} />
        </linearGradient>
        {/* Subtle brand-coloured glow disc behind the mark — adds depth/richness. */}
        <radialGradient id={rg} cx="0.5" cy="0.42" r="0.62">
          <stop offset="0" stopColor="#ff9a5c" stopOpacity="0.26" />
          <stop offset="0.55" stopColor="#b87fb0" stopOpacity="0.12" />
          <stop offset="1" stopColor="#45a8ff" stopOpacity="0" />
        </radialGradient>
        {glow && (
          // A soft outer glow that does NOT blur the crisp strokes (drop-shadow only).
          <filter id={gl} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#b87fb0" floodOpacity="0.6" />
          </filter>
        )}
      </defs>
      {/* Flat glow disc (no stroke) so it never softens the lines. */}
      <circle cx="100" cy="100" r="88" fill={`url(#${rg})`} />
      <g
        filter={glow ? `url(#${gl})` : undefined}
        fill="none"
        stroke={`url(#${lg})`}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="100" cy="100" r="78" strokeWidth="7" />
        <path d={LOGO_WAVEFORM_D} strokeWidth="6" />
      </g>
    </svg>
  );
}
