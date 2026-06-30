'use client';

import { useEffect, useMemo, useRef } from 'react';
import { EQ_THEMES, type EqTheme, type EqStyle } from '@/hooks/useEqualizerSettings';
import { createSpectrumEngine } from '@/lib/eqSignal';

interface EqualizerProps {
  isPlaying: boolean;
  /** New track → ramp the bars in from zero so they wake up during the buffer. */
  trackId?: string;
  theme?: EqTheme;
  style?: EqStyle;
  barCount?: number;
  glow?: boolean;
  className?: string;
}

const RAMP_MS = 1100;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uAmp;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uGlow;
uniform float uBands;
uniform int uStyle;   // 0 bars, 1 blocks, 2 mirror
uniform int uRainbow;
uniform vec2 uRes;

vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 grad(float t){
  if (uRainbow == 1) return hsv2rgb(vec3(t * 0.83, 0.85, 1.0));
  t = clamp(t, 0.0, 1.0);
  return t < 0.5 ? mix(uColorA, uColorB, t * 2.0) : mix(uColorB, uColorC, (t - 0.5) * 2.0);
}
float ampAt(float x){ return texture2D(uAmp, vec2(clamp(x, 0.0, 1.0), 0.5)).r; }

void main(){
  vec2 uv = vUv;
  float px = 1.5 / uRes.y;
  vec3 color = vec3(0.0);

  if (uStyle <= 2) {
    // bars (0) / blocks (1) / mirror (2)
    bool mirror = (uStyle == 2);
    float vy = mirror ? abs(uv.y - 0.5) * 2.0 : uv.y;
    float x = uv.x;
    float gapMask = 1.0;
    if (uStyle == 0 || uStyle == 1) {
      float idx = floor(x * uBands);
      float fr = fract(x * uBands);
      gapMask = smoothstep(0.10, 0.16, fr) * smoothstep(0.90, 0.84, fr);
      x = (idx + 0.5) / uBands;
    }
    float a = pow(ampAt(x), 0.85);
    float top = a;
    float fill = smoothstep(top + px, top - px, vy);
    vec3 baseCol = grad(mirror ? vy : (vy / max(top, 0.001)));
    float inner = exp(-max(0.0, top - vy) / 0.05) * fill;
    float halo = exp(-max(0.0, vy - top) / 0.12) * uGlow;
    float cap = 1.0 - smoothstep(0.0, px * 2.5, abs(vy - top));
    float seg = 1.0;
    if (uStyle == 1) { float sy = fract(vy * 24.0); seg = smoothstep(0.0, 0.16, sy) * smoothstep(1.0, 0.84, sy); }
    color = baseCol * fill * seg + baseCol * inner * 0.7 + grad(top) * halo + vec3(1.0) * cap * 0.5 * step(0.02, top);
    color *= gapMask;
    if (mirror && uv.y < 0.5) color *= 0.5;
  } else if (uStyle == 3) {
    // wave — a glowing contour line tracing the spectrum top
    float a = pow(ampAt(uv.x), 0.85);
    float dist = abs(uv.y - a);
    float core = 1.0 - smoothstep(0.0, px * 2.5, dist);
    float glw = exp(-dist / 0.06) * uGlow;
    vec3 c = grad(a);
    color = (c * core + c * glw * 0.85) * step(0.02, a);
  } else if (uStyle == 4) {
    // ribbon — a smooth filled area under the spectrum curve
    float a = pow(ampAt(uv.x), 0.85);
    float fill = smoothstep(a + px, a - px, uv.y);
    vec3 baseCol = grad(uv.y / max(a, 0.001));
    float inner = exp(-max(0.0, a - uv.y) / 0.06) * fill;
    float halo = exp(-max(0.0, uv.y - a) / 0.14) * uGlow;
    float line = 1.0 - smoothstep(0.0, px * 2.0, abs(uv.y - a));
    color = baseCol * fill * 0.8 + baseCol * inner * 0.8 + grad(a) * halo + grad(a) * line * 0.9 * step(0.02, a);
  } else if (uStyle == 5) {
    // dots — a glowing dot riding the top of each band (round via pixel space)
    float idx = floor(uv.x * uBands);
    float cx = (idx + 0.5) / uBands;
    float a = pow(ampAt(cx), 0.85);
    vec2 dpx = vec2((uv.x - cx) * uRes.x, (uv.y - a) * uRes.y);
    float r = length(dpx);
    float dotR = uRes.y * 0.11;
    float core = 1.0 - smoothstep(dotR * 0.5, dotR, r);
    float glw = exp(-r / (uRes.y * 0.18)) * uGlow;
    vec3 c = grad(a);
    color = (c * core + c * glw * 0.7) * step(0.02, a);
  } else {
    // aurora (6) — soft feathered glow columns, no hard edge
    float a = pow(ampAt(uv.x), 0.85);
    float body = smoothstep(a + 0.16, a - 0.04, uv.y);
    float halo = exp(-max(0.0, uv.y - a) / 0.18) * uGlow;
    color = grad(uv.y) * body * 0.7 + grad(a) * halo * 0.7;
  }

  // Each pixel is shaded once, so no blending is needed — alpha = luminance makes
  // the dark areas transparent so the panel shows through and the spectrum glows.
  float lum = clamp(max(max(color.r, color.g), color.b), 0.0, 1.0);
  gl_FragColor = vec4(color, lum);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // eslint-disable-next-line no-console
    console.error('Equalizer shader compile error:', gl.getShaderInfoLog(sh));
  }
  return sh;
}

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
  const rafRef = useRef<number>();
  const drawRef = useRef<(ts: number) => void>();
  const lastTsRef = useRef<number>(0);
  const rampStartRef = useRef(0);

  // Latest props read inside the loop without rebuilding the GL context.
  const live = useRef({ isPlaying, style, glow, theme });
  live.current = { isPlaying, style, glow, theme };

  const stops = useMemo(() => EQ_THEMES.find((t) => t.id === theme)?.stops ?? EQ_THEMES[0].stops, [theme]);

  // New track → restart the ramp-in.
  useEffect(() => {
    if (!trackId) return;
    rampStartRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
  }, [trackId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      preserveDrawingBuffer: true, // keep last frame when we stop drawing (paused)
    });
    if (!gl) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      // eslint-disable-next-line no-console
      console.error('Equalizer program link error:', gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    // Full-screen quad.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Band amplitude texture (1 row, LINEAR so the curve interpolates smoothly).
    const bands = Math.max(8, barCount);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const pixels = new Uint8Array(bands);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, bands, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels);

    const U = {
      amp: gl.getUniformLocation(prog, 'uAmp'),
      a: gl.getUniformLocation(prog, 'uColorA'),
      b: gl.getUniformLocation(prog, 'uColorB'),
      c: gl.getUniformLocation(prog, 'uColorC'),
      glow: gl.getUniformLocation(prog, 'uGlow'),
      bands: gl.getUniformLocation(prog, 'uBands'),
      style: gl.getUniformLocation(prog, 'uStyle'),
      rainbow: gl.getUniformLocation(prog, 'uRainbow'),
      res: gl.getUniformLocation(prog, 'uRes'),
    };
    gl.uniform1i(U.amp, 0);
    gl.uniform1f(U.bands, bands);

    const engine = createSpectrumEngine(bands);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round((canvas.offsetWidth || 200) * dpr));
      const h = Math.max(1, Math.round((canvas.offsetHeight || 60) * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.res, w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const STYLE_ID: Record<EqStyle, number> = {
      bars: 0,
      blocks: 1,
      mirror: 2,
      wave: 3,
      ribbon: 4,
      dots: 5,
      aurora: 6,
    };
    const styleId = (s: EqStyle) => STYLE_ID[s] ?? 0;

    const draw = (ts: number) => {
      const dt = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0.016;
      lastTsRef.current = ts;

      const p = live.current;
      const rampStart = rampStartRef.current;
      const ramp = rampStart === 0 ? 1 : Math.min(1, (ts - rampStart) / RAMP_MS);
      const intensity = ramp * ramp * (3 - 2 * ramp); // smoothstep

      const amps = engine.step(dt, p.isPlaying, p.isPlaying ? intensity : 0);
      for (let i = 0; i < bands; i++) pixels[i] = Math.round(Math.min(1, amps[i]) * 255);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, bands, 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels);

      const themeStops = EQ_THEMES.find((t) => t.id === p.theme)?.stops ?? stops;
      const rainbow = themeStops[0] === 'rainbow';
      gl.uniform1i(U.rainbow, rainbow ? 1 : 0);
      if (!rainbow) {
        const ca = hexToRgb(themeStops[0]);
        const cb = hexToRgb(themeStops[Math.min(1, themeStops.length - 1)]);
        const cc = hexToRgb(themeStops[themeStops.length - 1]);
        gl.uniform3f(U.a, ca[0], ca[1], ca[2]);
        gl.uniform3f(U.b, cb[0], cb[1], cb[2]);
        gl.uniform3f(U.c, cc[0], cc[1], cc[2]);
      }
      gl.uniform1i(U.style, styleId(p.style));
      gl.uniform1f(U.glow, p.glow ? 1.0 : 0.25);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Keep animating only while playing; freeze the last frame when paused
      // (preserveDrawingBuffer keeps it on screen) to spare the GPU.
      if (live.current.isPlaying) {
        rafRef.current = requestAnimationFrame(draw);
      } else {
        rafRef.current = undefined;
      }
    };
    drawRef.current = draw;
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
      ro.disconnect();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // Rebuild only when the band count changes (texture size). theme/style/glow
    // are read live via the ref; isPlaying restart is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barCount]);

  // Restart the loop when playback resumes (it self-stops when paused).
  useEffect(() => {
    if (isPlaying && rafRef.current === undefined && drawRef.current) {
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(drawRef.current);
    }
  }, [isPlaying]);

  return <canvas ref={canvasRef} className={className} />;
}
