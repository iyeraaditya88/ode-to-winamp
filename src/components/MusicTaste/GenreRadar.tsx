'use client';

import { m } from 'framer-motion';
import type { GenreSlice } from '@/lib/genres';

const SIZE = 340;
const C = SIZE / 2;
const R = SIZE * 0.33;
const LEVELS = [0.25, 0.5, 0.75, 1];

function point(i: number, n: number, r: number) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r };
}

/** Hand-rolled SVG radar: the user's genre distribution as a glowing polygon. */
export default function GenreRadar({ slices }: { slices: GenreSlice[] }) {
  const n = slices.length;
  // Normalise to the strongest genre so the shape fills the chart nicely.
  const maxPct = Math.max(1, ...slices.map((s) => s.pct));
  const dataPts = slices.map((s, i) => point(i, n, R * (s.pct / maxPct)));
  const polygon = dataPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const topId = [...slices].sort((a, b) => b.pct - a.pct)[0]?.id;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[340px] mx-auto overflow-visible">
      <defs>
        <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00d8d8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#00b4b4" stopOpacity="0.1" />
        </radialGradient>
        <filter id="radarGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* concentric grid rings */}
      {LEVELS.map((lvl) => (
        <polygon
          key={lvl}
          points={Array.from({ length: n }, (_, i) => {
            const p = point(i, n, R * lvl);
            return `${p.x},${p.y}`;
          }).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1"
        />
      ))}

      {/* spokes + axis labels */}
      {slices.map((s, i) => {
        const edge = point(i, n, R);
        const lab = point(i, n, R + 20);
        const anchor = Math.abs(lab.x - C) < 8 ? 'middle' : lab.x > C ? 'start' : 'end';
        const isTop = s.id === topId;
        return (
          <g key={s.id}>
            <line x1={C} y1={C} x2={edge.x} y2={edge.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text
              x={lab.x}
              y={lab.y}
              dy="0.3em"
              textAnchor={anchor}
              style={{
                fontSize: 8.5,
                letterSpacing: '0.06em',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                fill: isTop ? '#00d8d8' : 'rgba(255,255,255,0.5)',
              }}
            >
              {s.label}
            </text>
          </g>
        );
      })}

      {/* user's distribution polygon, scaling in from the centre */}
      <m.g
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        style={{ transformOrigin: `${C}px ${C}px`, transformBox: 'view-box' }}
      >
        <polygon points={polygon} fill="url(#radarFill)" stroke="#00d8d8" strokeWidth="1.5" filter="url(#radarGlow)" opacity="0.8" />
        <polygon points={polygon} fill="url(#radarFill)" stroke="#00d8d8" strokeWidth="1.5" />
        {dataPts.map((p, i) =>
          slices[i].pct > 0 ? <circle key={i} cx={p.x} cy={p.y} r="2.4" fill="#00f0f0" /> : null
        )}
      </m.g>
    </svg>
  );
}
