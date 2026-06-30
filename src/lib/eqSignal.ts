// Generative spectrum engine for the visualizer. Spotify's SDK audio is DRM-
// protected so we can't FFT the real output — instead we synthesise a spectrum
// that *feels* musical and, crucially, doesn't visibly loop: a drifting beat
// drives the low bands, several incommensurate LFOs give organic mid/high
// motion, a pink-ish envelope shapes the overall tilt, and occasional "fills"
// punch in. Per-band attack/release keeps it smooth.

export interface SpectrumEngine {
  /** Advance by dt seconds and return band amplitudes (0..1). Reused buffer. */
  step(dtSec: number, playing: boolean, intensity: number): Float32Array;
}

export function createSpectrumEngine(bands: number): SpectrumEngine {
  const heights = new Float32Array(bands);
  const seed = new Float32Array(bands);
  for (let i = 0; i < bands; i++) seed[i] = Math.random() * 1000;

  let t = 0;
  let beatPhase = 0;
  let bpm = 116 + Math.random() * 10;
  let nextFill = 4 + Math.random() * 4;
  let fillEnv = 0;

  return {
    step(dt, playing, intensity) {
      if (!playing || intensity <= 0.001) {
        // Freeze (or settle toward rest) when not playing.
        return heights;
      }
      // Guard against huge dt after a tab was backgrounded.
      const d = Math.min(dt, 0.05);
      t += d;

      const beatPeriod = 60 / bpm;
      beatPhase += d / beatPeriod;
      const beatPos = beatPhase % 1;
      const kick = Math.pow(1 - beatPos, 3);
      const off = Math.pow(1 - ((beatPhase + 0.5) % 1), 3) * 0.5;

      nextFill -= d;
      if (nextFill <= 0) {
        fillEnv = 1;
        nextFill = 3 + Math.random() * 5;
        bpm = 110 + Math.random() * 18; // drift tempo so it never settles into a loop
      }
      fillEnv = Math.max(0, fillEnv - d * 1.3);

      for (let i = 0; i < bands; i++) {
        const norm = bands > 1 ? i / (bands - 1) : 0;
        const bass = 1 - norm;
        // Pink-ish tilt: more energy in the low end, gentle roll-off up top.
        const spectral = Math.pow(1 - norm, 0.8) * 0.7 + 0.3;
        const s = seed[i];
        const lfo =
          (Math.sin(t * 2.3 + s) * 0.5 + Math.sin(t * 5.7 + s * 1.7) * 0.3 + Math.sin(t * 11.3 + s * 0.3) * 0.2) *
            0.5 +
          0.5;
        const fill = fillEnv * (0.3 + 0.5 * norm) * (Math.sin(t * 30 + s) * 0.5 + 0.5);

        let target =
          intensity *
          spectral *
          (kick * (0.4 + 0.55 * bass) + off * (0.3 * bass) + lfo * (0.15 + 0.35 * norm) + fill);
        target = Math.min(1, Math.max(0, target));

        // Punchy attack, smoother release.
        const k = target > heights[i] ? 0.45 : 0.12;
        heights[i] += (target - heights[i]) * k;
      }
      return heights;
    },
  };
}
