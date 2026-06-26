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
        {glow && (
          <filter id={gl} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <g
        filter={glow ? `url(#${gl})` : undefined}
        fill="none"
        stroke={`url(#${lg})`}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="100" cy="100" r="78" strokeWidth="4" />
        <path d={LOGO_WAVEFORM_D} strokeWidth="3.4" />
      </g>
    </svg>
  );
}
