'use client';

import { useEffect, useRef, useMemo } from 'react';
import { EQ_THEMES, type EqTheme, type EqStyle } from '@/hooks/useEqualizerSettings';

function makeFreqFactors(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return 0.3 + t * t * 3.7;
  });
}

interface EqualizerProps {
  isPlaying: boolean;
  theme?: EqTheme;
  style?: EqStyle;
  barCount?: number;
  glow?: boolean;
  className?: string;
}

export default function Equalizer({
  isPlaying,
  theme = 'winamp',
  style = 'blocks',
  barCount = 32,
  glow = true,
  className = '',
}: EqualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>();
  const heights = useRef<number[]>([]);
  const peaks = useRef<number[]>([]);
  const peakAt = useRef<number[]>([]);

  const freqFactors = useMemo(() => makeFreqFactors(barCount), [barCount]);
  const stops = useMemo(() => EQ_THEMES.find((t) => t.id === theme)?.stops ?? EQ_THEMES[0].stops, [theme]);

  useEffect(() => {
    heights.current = Array(barCount).fill(0);
    peaks.current = Array(barCount).fill(0);
    peakAt.current = Array(barCount).fill(0);
  }, [barCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const W = canvas.offsetWidth || 200;
      const H = canvas.offsetHeight || 60;
      canvas.width = W * window.devicePixelRatio;
      canvas.height = H * window.devicePixelRatio;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const colorFor = (i: number, yTop: number, H: number): string | CanvasGradient => {
      if (stops[0] === 'rainbow') {
        return `hsl(${(i / barCount) * 300}, 90%, 55%)`;
      }
      const g = ctx.createLinearGradient(0, H, 0, yTop);
      stops.forEach((c, idx) => g.addColorStop(idx / (stops.length - 1), c));
      return g;
    };

    const draw = (ts: number) => {
      const W = canvas.offsetWidth || 200;
      const H = canvas.offsetHeight || 60;
      ctx.clearRect(0, 0, W, H);

      const usableH = style === 'mirror' ? H / 2 : H;
      const baseY = style === 'mirror' ? H / 2 : H;
      const gap = Math.max(1, W / barCount / 6);
      const barW = (W - (barCount - 1) * gap) / barCount;

      ctx.shadowBlur = glow ? 12 : 0;

      for (let i = 0; i < barCount; i++) {
        const target = isPlaying
          ? (Math.sin(ts * 0.001 * freqFactors[i]) * 0.5 + 0.5) *
            (0.45 + 0.55 * Math.abs(Math.sin(ts * 0.0006 * (freqFactors[i] * 0.6 + 0.4)))) *
            usableH *
            0.92
          : 0;

        heights.current[i] = heights.current[i] * 0.82 + target * 0.18;
        const h = heights.current[i];

        if (h > peaks.current[i]) {
          peaks.current[i] = h;
          peakAt.current[i] = ts + 650;
        } else if (ts > peakAt.current[i]) {
          peaks.current[i] = Math.max(0, peaks.current[i] - usableH * 0.012);
        }

        const x = i * (barW + gap);
        const topColor = stops[0] === 'rainbow' ? `hsl(${(i / barCount) * 300}, 90%, 60%)` : stops[stops.length - 1];
        const fill = colorFor(i, baseY - h, H);
        ctx.shadowColor = typeof topColor === 'string' ? topColor : '#00ff41';
        ctx.fillStyle = fill;

        if (style === 'blocks') {
          // Segmented LED look — classic Winamp.
          const seg = 3;
          const gapSeg = 2;
          const count = Math.floor(h / (seg + gapSeg));
          for (let s = 0; s < count; s++) {
            const yy = baseY - (s + 1) * (seg + gapSeg);
            ctx.fillRect(x, yy, barW, seg);
          }
        } else {
          ctx.fillRect(x, baseY - h, barW, h);
          if (style === 'mirror') {
            ctx.globalAlpha = 0.4;
            ctx.fillRect(x, baseY, barW, h);
            ctx.globalAlpha = 1;
          }
        }

        // Peak hold marker.
        if (peaks.current[i] > 2 && style !== 'blocks') {
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillRect(x, baseY - peaks.current[i] - 1, barW, 2);
          if (style === 'mirror') ctx.fillRect(x, baseY + peaks.current[i] - 1, barW, 2);
          ctx.shadowBlur = glow ? 12 : 0;
        }
      }
      ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [isPlaying, style, glow, barCount, freqFactors, stops]);

  return <canvas ref={canvasRef} className={className} />;
}
