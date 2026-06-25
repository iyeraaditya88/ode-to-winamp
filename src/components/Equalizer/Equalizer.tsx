'use client';

import { useEffect, useRef } from 'react';

const BAR_COUNT = 32;

function makeFreqFactors(): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const t = i / (BAR_COUNT - 1);
    return 0.3 + t * t * 3.7;
  });
}

const FREQ_FACTORS = makeFreqFactors();

interface EqualizerProps {
  isPlaying: boolean;
  className?: string;
}

export default function Equalizer({ isPlaying, className = '' }: EqualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>();
  const heights = useRef<number[]>(Array(BAR_COUNT).fill(0));
  const peaks = useRef<number[]>(Array(BAR_COUNT).fill(0));
  const peakTimers = useRef<number[]>(Array(BAR_COUNT).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const barW = (W - (BAR_COUNT - 1) * 2) / BAR_COUNT;

    const draw = (ts: number) => {
      ctx.clearRect(0, 0, W, H);

      for (let i = 0; i < BAR_COUNT; i++) {
        const target = isPlaying
          ? (Math.sin(ts * 0.001 * FREQ_FACTORS[i]) * 0.5 + 0.5) *
            (0.4 + 0.6 * Math.sin(ts * 0.0007 * (FREQ_FACTORS[i] * 0.5))) *
            H * 0.9
          : 0;

        heights.current[i] = heights.current[i] * 0.85 + target * 0.15;
        const h = heights.current[i];

        if (h > peaks.current[i]) {
          peaks.current[i] = h;
          peakTimers.current[i] = ts + 600;
        } else if (ts > peakTimers.current[i]) {
          peaks.current[i] = Math.max(0, peaks.current[i] - 1);
        }

        const x = i * (barW + 2);
        const y = H - h;

        const grad = ctx.createLinearGradient(0, H, 0, y);
        grad.addColorStop(0, '#00b4b4');
        grad.addColorStop(0.6, '#1db954');
        grad.addColorStop(1, '#00ff41');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW, h);

        if (peaks.current[i] > 2) {
          ctx.fillStyle = 'rgba(0, 255, 65, 0.7)';
          ctx.fillRect(x, H - peaks.current[i] - 1, barW, 2);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      className={`${className}`}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
