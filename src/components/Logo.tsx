'use client';

import { useId } from 'react';
import { LOGO_WAVEFORM_D, LOGO_GRADIENT } from './logoPath';

interface LogoProps {
  size?: number;
  /** Adds a soft outer halo around the whole badge. */
  glow?: boolean;
  className?: string;
}

/** The Ode to Winamp mark — a rich, glassy badge: a gradient ring with a neon
 *  audio waveform over a vignetted disc, with a specular highlight. */
export default function Logo({ size = 24, glow = false, className = '' }: LogoProps) {
  const raw = useId().replace(/:/g, '');
  const lg = `lg-${raw}`;
  const disc = `disc-${raw}`;
  const rg = `rg-${raw}`;
  const spec = `spec-${raw}`;
  const neon = `neon-${raw}`;
  const halo = `halo-${raw}`;
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
        <radialGradient id={disc} cx="0.5" cy="0.38" r="0.78">
          <stop offset="0" stopColor="#262430" />
          <stop offset="0.6" stopColor="#141318" />
          <stop offset="1" stopColor="#09090b" />
        </radialGradient>
        <radialGradient id={rg} cx="0.5" cy="0.46" r="0.6">
          <stop offset="0" stopColor="#ff9a5c" stopOpacity="0.32" />
          <stop offset="0.5" stopColor="#b87fb0" stopOpacity="0.16" />
          <stop offset="1" stopColor="#45a8ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={spec} cx="0.5" cy="0.16" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.20" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* Neon glow behind the waveform — the crisp stroke is drawn on top, so it
            glows without going blurry. */}
        <filter id={neon} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
          </feMerge>
        </filter>
        {glow && (
          <filter id={halo} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#b87fb0" floodOpacity="0.55" />
          </filter>
        )}
      </defs>

      <g filter={glow ? `url(#${halo})` : undefined}>
        {/* glossy disc + brand glow */}
        <circle cx="100" cy="100" r="92" fill={`url(#${disc})`} />
        <circle cx="100" cy="100" r="88" fill={`url(#${rg})`} />
        {/* neon glow copy of the waveform */}
        <g
          fill="none"
          stroke={`url(#${lg})`}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${neon})`}
          opacity="0.85"
        >
          <path d={LOGO_WAVEFORM_D} strokeWidth="6" />
        </g>
        {/* gradient ring + glass highlight ring */}
        <circle cx="100" cy="100" r="78" fill="none" stroke={`url(#${lg})`} strokeWidth="7" />
        <circle cx="100" cy="100" r="74.2" fill="none" stroke="#ffffff" strokeOpacity="0.13" strokeWidth="1.4" />
        {/* crisp waveform on top */}
        <path
          d={LOGO_WAVEFORM_D}
          fill="none"
          stroke={`url(#${lg})`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* specular highlight */}
        <ellipse cx="100" cy="56" rx="64" ry="34" fill={`url(#${spec})`} />
      </g>
    </svg>
  );
}
