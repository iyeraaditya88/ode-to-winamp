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
  /** Current track id. When it changes, the bars ramp in from zero so they wake
   *  up during the playback-start buffer instead of snapping to full height
   *  before any audio is audible (which read as a delay). */
  trackId?: string;
  theme?: EqTheme;
  style?: EqStyle;
  barCount?: number;
  glow?: boolean;
  className?: string;
}

const RAMP_MS = 1100; // ramp-in duration, ~ the SDK's stream-start buffer

export default function Equalizer({
  isPlaying,
  trackId,
  theme = 'winamp',
  style = 'blocks',
  barCount = 32,
  glow = true,
  className = '',
}: EqualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>();
  const drawRef = useRef<(ts: number) => void>();
  const heights = useRef<number[]>([]);
  const peaks = useRef<number[]>([]);
  const peakAt = useRef<number[]>([]);
  const rampStartRef = useRef(0); // ts the current ramp-in began (0 = no ramp)

  // Latest play state read inside the draw loop without rebuilding the effect.
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const freqFactors = useMemo(() => makeFreqFactors(barCount), [barCount]);
  const stops = useMemo(() => EQ_THEMES.find((t) => t.id === theme)?.stops ?? EQ_THEMES[0].stops, [theme]);

  useEffect(() => {
    heights.current = Array(barCount).fill(0);
    peaks.current = Array(barCount).fill(0);
    peakAt.current = Array(barCount).fill(0);
  }, [barCount]);

  // New track: reset the bars to zero and start the ramp-in. Keyed on trackId
  // only, so resuming the SAME song (no buffer gap) does NOT re-ramp.
  useEffect(() => {
    if (!trackId) return;
    rampStartRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
    heights.current = heights.current.map(() => 0);
    peaks.current = peaks.current.map(() => 0);
  }, [trackId]);

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

      const playing = isPlayingRef.current;

      // Simulated rhythm. True beat-sync isn't possible here (the Spotify SDK's
      // audio is DRM-protected so the Web Audio API can't analyse it, and the
      // Audio-Analysis API is blocked for this app), so a steady tempo drives a
      // pumping envelope — bass kicks on the beat, treble shimmers — which reads
      // as musical rather than the old random sine noise.
      const t = ts / 1000;
      const beatPeriod = 60 / 120; // ~120 BPM
      const beatEnv = Math.pow(1 - (t % beatPeriod) / beatPeriod, 2.2);
      const offEnv = Math.pow(1 - ((t + beatPeriod / 2) % beatPeriod) / beatPeriod, 3) * 0.5;

      // Ramp-in envelope: 0→1 over RAMP_MS after a track starts, smoothstepped so
      // the bars swell up gracefully while the stream buffers, hitting full height
      // about when audio actually begins.
      const rampStart = rampStartRef.current;
      const lin = rampStart === 0 ? 1 : Math.min(1, Math.max(0, (ts - rampStart) / RAMP_MS));
      const rampEnv = lin * lin * (3 - 2 * lin);

      for (let i = 0; i < barCount; i++) {
        // While playing, advance the bars. While paused, freeze them in place
        // (don't decay to zero) so the waveform holds its last frame.
        if (playing) {
          const norm = barCount > 1 ? i / (barCount - 1) : 0;
          const bass = 1 - norm;
          const shimmer = Math.sin(t * (5 + norm * 22) + i * 1.3) * 0.5 + 0.5;
          const target =
            (beatEnv * (0.42 + 0.58 * bass) +
              offEnv * (0.35 * bass) +
              shimmer * (0.12 + 0.33 * norm)) *
            usableH *
            0.95 *
            rampEnv;

          // Punchy attack on the beat, smoother decay.
          const k = target > heights.current[i] ? 0.5 : 0.16;
          heights.current[i] = heights.current[i] * (1 - k) + target * k;

          if (heights.current[i] > peaks.current[i]) {
            peaks.current[i] = heights.current[i];
            peakAt.current[i] = ts + 650;
          } else if (ts > peakAt.current[i]) {
            peaks.current[i] = Math.max(0, peaks.current[i] - usableH * 0.012);
          }
        }

        const h = heights.current[i];

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

      // Keep animating only while playing; when paused, this frame is the final
      // frozen render and we stop scheduling (no idle CPU/battery burn).
      if (isPlayingRef.current) {
        animRef.current = requestAnimationFrame(draw);
      } else {
        animRef.current = undefined;
      }
    };

    drawRef.current = draw;
    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = undefined;
      ro.disconnect();
    };
    // isPlaying intentionally excluded — read via ref so pausing freezes the
    // bars without tearing down/clearing the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, glow, barCount, freqFactors, stops]);

  // Restart the loop when playback resumes (the loop self-stops when paused).
  useEffect(() => {
    if (isPlaying && animRef.current === undefined && drawRef.current) {
      animRef.current = requestAnimationFrame(drawRef.current);
    }
  }, [isPlaying]);

  return <canvas ref={canvasRef} className={className} />;
}
