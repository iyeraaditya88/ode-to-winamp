'use client';

import { forwardRef, useMemo, type MutableRefObject } from 'react';
import { Effect } from 'postprocessing';
import { Uniform } from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * Lens / barrel distortion + vignette post-processing effect.
 * Replicates phantom.land's signature curved "inside a sphere" look:
 *   shiftedUv *= (base + distortion * dot(shiftedUv, shiftedUv))
 * The radial term grows with distance from center, bowing the edges away.
 */
const fragmentShader = /* glsl */ `
uniform float distortion;
uniform float vignette;

void mainUv(inout vec2 uv) {
  vec2 s = uv * 2.0 - 1.0;            // remap to -1..1, center at 0
  float r2 = dot(s, s);              // squared distance from center
  s *= (0.92 + distortion * r2);     // barrel distortion
  uv = s * 0.5 + 0.5;               // back to 0..1
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 s = uv * 2.0 - 1.0;
  float d = length(s);
  float vig = smoothstep(1.35, 0.25, d * vignette);
  outputColor = vec4(inputColor.rgb * vig, inputColor.a);
}
`;

class LensDistortionImpl extends Effect {
  constructor(distortion = 0.12, vignette = 1.0) {
    super('LensDistortion', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['distortion', new Uniform(distortion)],
        ['vignette', new Uniform(vignette)],
      ]),
    });
  }
}

interface LensDistortionProps {
  distortionRef: MutableRefObject<number>;
  vignette?: number;
}

export const LensDistortion = forwardRef<LensDistortionImpl, LensDistortionProps>(
  function LensDistortion({ distortionRef, vignette = 1.05 }, ref) {
    const effect = useMemo(() => new LensDistortionImpl(distortionRef.current, vignette), [vignette, distortionRef]);

    // Drive the distortion uniform from the shared ref every frame so GSAP /
    // drag state can animate the curvature smoothly.
    useFrame(() => {
      const u = effect.uniforms.get('distortion');
      if (u) u.value = distortionRef.current;
    });

    return <primitive ref={ref} object={effect} dispose={null} />;
  }
);
