'use client';

import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import gsap from 'gsap';
import { LensDistortion } from './LensDistortion';
import type { SpotifyTrack } from '@/types/spotify';

const CONTENT_SKEW = 7; // de-correlates rows so neighbours differ
const FOV = 45; // matches the Canvas camera fov
const BASE_Z = 10; // matches the Canvas camera z (default zoom level)
const DRAG_PUSH = 1.2; // camera recedes this much while dragging

function posMod(n: number, m: number) {
  return ((n % m) + m) % m;
}

/** Shared, lazily-populated album-art texture cache. */
function useTextureCache() {
  const cache = useRef(new Map<string, THREE.Texture>());
  const loader = useMemo(() => {
    const l = new THREE.TextureLoader();
    l.setCrossOrigin('anonymous');
    return l;
  }, []);

  const get = useCallback(
    (url: string | undefined): THREE.Texture | null => {
      if (!url) return null;
      const existing = cache.current.get(url);
      if (existing) return existing;
      const tex = loader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      cache.current.set(url, tex);
      return tex;
    },
    [loader]
  );

  return get;
}

interface TileData {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  col: number; // slot index in pool
  row: number;
  contentIndex: number; // current song index displayed
  targetScale: number;
  scale: number;
  baseOpacity: number;
}

const ENTRANCE_DURATION = 1.3; // seconds for the burst-into-tiles reveal

interface GridSceneProps {
  songs: SpotifyTrack[];
  onPlay: (track: SpotifyTrack) => void;
  currentTrackId?: string;
  distortionRef: React.MutableRefObject<number>;
  burst: boolean;
  onReady?: () => void;
}

function GridScene({ songs, onPlay, currentTrackId, distortionRef, burst, onReady }: GridSceneProps) {
  const { viewport, size, camera, gl } = useThree();
  const getTexture = useTextureCache();
  const groupRef = useRef<THREE.Group>(null);

  // Phones get smaller, denser tiles and a stronger curve.
  const isMobile = size.width < 640;
  const STRIDE = isMobile ? 2.15 : 3.2; // world-space distance between tile centers
  const TILE = isMobile ? 1.8 : 2.7; // tile size (square)
  const REST_DIST = isMobile ? 0.18 : 0.12;
  const DRAG_DIST = isMobile ? 0.34 : 0.26;
  const ZOOM_MIN = isMobile ? 5.5 : 6.5; // most zoomed-in (camera closest)
  const ZOOM_MAX = isMobile ? 13 : 15; // most zoomed-out (camera farthest)

  // Drag / inertia state (kept in refs to avoid re-renders).
  const pan = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const downPointer = useRef({ x: 0, y: 0 });
  const moved = useRef(0);
  const pointerNorm = useRef({ x: 0, y: 0 });
  const ambient = useRef({ x: 0, y: 0 });
  const hoveredTile = useRef<number>(-1);
  const entranceStart = useRef<number>(-1); // clock time the burst reveal began
  const zoomRef = useRef(BASE_Z); // target camera z (scroll/pinch zoom level)
  const pinchingRef = useRef(false); // a two-finger pinch is in progress

  // Signal readiness after a few warm-up frames (shader compiled, first
  // textures uploaded) so the intro can burst with no black gap.
  const readyFrames = useRef(0);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Size the recycled tile pool for the most zoomed-OUT view (+ margin) so
  // zooming out never reveals gaps and we never rebuild tiles on zoom.
  const maxViewH = 2 * ZOOM_MAX * Math.tan(((FOV * Math.PI) / 180) / 2);
  const maxViewW = maxViewH * (size.width / Math.max(1, size.height));
  const cols = Math.ceil(maxViewW / STRIDE) + 4;
  const rows = Math.ceil(maxViewH / STRIDE) + 4;

  const placeholder = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#161616';
    ctx.fillRect(0, 0, 8, 8);
    const t = new THREE.CanvasTexture(c);
    return t;
  }, []);

  const tiles = useMemo<TileData[]>(() => {
    const out: TileData[] = [];
    const geom = new THREE.PlaneGeometry(TILE, TILE);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const material = new THREE.MeshBasicMaterial({
          map: placeholder,
          transparent: true,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(geom, material);
        mesh.userData.poolIndex = out.length;
        out.push({ mesh, material, col: c, row: r, contentIndex: -1, targetScale: 1, scale: 1, baseOpacity: 0 });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows, placeholder, TILE]);

  // "Now playing" glow halo — a teal additive plane that sits behind the
  // active tile and pulses, giving an on-theme stylish indicator.
  const glow = useMemo(() => {
    const geom = new THREE.PlaneGeometry(TILE * 1.42, TILE * 1.42);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#00d8d8'),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.z = -0.08;
    mesh.visible = false;
    return { mesh, mat };
  }, [TILE]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    tiles.forEach((t) => group.add(t.mesh));
    group.add(glow.mesh);
    return () => {
      tiles.forEach((t) => {
        group.remove(t.mesh);
        t.material.dispose();
      });
      group.remove(glow.mesh);
      glow.mat.dispose();
    };
  }, [tiles, glow]);

  // Map screen pixels to world units at the z=0 plane.
  const pxToWorld = viewport.width / size.width;

  // Raycaster for click / hover detection.
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useRef(new THREE.Vector2());

  const tileUnderPointer = useCallback(
    (clientX: number, clientY: number): TileData | null => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.current.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc.current, camera);
      const hits = raycaster.intersectObjects(tiles.map((t) => t.mesh), false);
      if (hits.length === 0) return null;
      const idx = hits[0].object.userData.poolIndex as number;
      return tiles[idx] ?? null;
    },
    [camera, gl, raycaster, tiles]
  );

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = 'none';

    const onDown = (e: PointerEvent) => {
      if (pinchingRef.current) return;
      dragging.current = true;
      hoveredTile.current = -1; // no hover scale-up while dragging
      moved.current = 0;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      downPointer.current = { x: e.clientX, y: e.clientY };
      vel.current = { x: 0, y: 0 };
      el.setPointerCapture(e.pointerId);
      // Deepen curvature while interacting (camera recede handled in useFrame).
      gsap.to(distortionRef, { current: DRAG_DIST, duration: 1, ease: 'power2.out' });
    };

    const onMove = (e: PointerEvent) => {
      if (pinchingRef.current) return;
      const rect = el.getBoundingClientRect();
      pointerNorm.current = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };

      if (!dragging.current) {
        // Hover detection here (on actual pointer movement) instead of raycasting
        // every frame — far cheaper when the pointer is still.
        const tile = tileUnderPointer(e.clientX, e.clientY);
        hoveredTile.current = tile ? (tile.mesh.userData.poolIndex as number) : -1;
        return;
      }
      // Scale pixel→world by the current zoom so panning feels the same at any
      // zoom (a pixel covers more world when zoomed out).
      const zScale = camera.position.z / BASE_Z;
      const dx = (e.clientX - lastPointer.current.x) * pxToWorld * zScale;
      const dy = -(e.clientY - lastPointer.current.y) * pxToWorld * zScale;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      // Track the MAX displacement from the press point (not a running sum, which
      // ballooned on touch and broke tap-to-play).
      moved.current = Math.max(
        moved.current,
        Math.abs(e.clientX - downPointer.current.x) + Math.abs(e.clientY - downPointer.current.y)
      );

      pan.current.x += dx;
      pan.current.y += dy;
      // Smooth the velocity estimate (lerp toward latest delta at 0.8).
      vel.current.x = THREE.MathUtils.lerp(vel.current.x, dx, 0.8);
      vel.current.y = THREE.MathUtils.lerp(vel.current.y, dy, 0.8);
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {}
      gsap.to(distortionRef, { current: REST_DIST, duration: 1, ease: 'power2.out' });

      // A near-stationary press is a click → play that tile's track. (10px of
      // tolerance so finger jitter on touch still counts as a tap.)
      if (moved.current < 10) {
        const tile = tileUnderPointer(e.clientX, e.clientY);
        if (tile && tile.contentIndex >= 0) {
          const track = songs[tile.contentIndex % songs.length];
          if (track) onPlay(track);
        }
      }
    };

    const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

    // Desktop: scroll to zoom (up = in, map convention).
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current = clampZoom(zoomRef.current + e.deltaY * 0.01);
    };

    // Mobile: two-finger pinch to zoom.
    const fingerDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    let pinchPrev = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchingRef.current = true;
        dragging.current = false; // abandon any single-finger drag
        pinchPrev = fingerDist(e.touches);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinchingRef.current || e.touches.length !== 2) return;
      e.preventDefault();
      const d = fingerDist(e.touches);
      if (pinchPrev > 0 && d > 0) {
        // Fingers apart (d grows) → camera closer (z down) → zoom in.
        zoomRef.current = clampZoom(zoomRef.current * (pinchPrev / d));
      }
      pinchPrev = d;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchingRef.current = false;
        pinchPrev = 0;
      }
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [gl, camera, pxToWorld, distortionRef, tileUnderPointer, songs, onPlay, REST_DIST, DRAG_DIST, ZOOM_MIN, ZOOM_MAX]);

  // Keep the resting curvature in sync with the breakpoint (not while dragging).
  useEffect(() => {
    if (!dragging.current) distortionRef.current = REST_DIST;
  }, [REST_DIST, distortionRef]);

  const totalW = cols * STRIDE;
  const totalH = rows * STRIDE;

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    let playingPos: { x: number; y: number; scale: number } | null = null;

    // Fire onReady once the canvas has rendered a few frames (warm).
    if (readyFrames.current <= 4) {
      readyFrames.current += 1;
      if (readyFrames.current === 4) onReadyRef.current?.();
    }

    // Zoom (scroll/pinch) + drag-recede, eased. Camera dolly along z; the
    // lens-distortion sphere is screen-space so the look holds at any zoom.
    const targetZ = zoomRef.current + (dragging.current ? DRAG_PUSH : 0);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.12);

    // Entrance: once the logo bursts, explode tiles outward from the center.
    if (burst && entranceStart.current < 0) entranceStart.current = time;
    const globalP =
      entranceStart.current < 0 ? 0 : Math.min(1, (time - entranceStart.current) / ENTRANCE_DURATION);
    const maxDist = Math.max(1, Math.hypot(viewport.width / 2, viewport.height / 2));
    // Inertia: keep gliding after release, damping velocity toward 0 at 0.1.
    if (!dragging.current) {
      pan.current.x += vel.current.x;
      pan.current.y += vel.current.y;
      vel.current.x = THREE.MathUtils.lerp(vel.current.x, 0, 0.1);
      vel.current.y = THREE.MathUtils.lerp(vel.current.y, 0, 0.1);
    }

    // Ambient parallax — drift opposite to the cursor, eased.
    ambient.current.x = THREE.MathUtils.lerp(ambient.current.x, -pointerNorm.current.x * 0.35, 0.05);
    ambient.current.y = THREE.MathUtils.lerp(ambient.current.y, -pointerNorm.current.y * 0.35, 0.05);

    const ox = pan.current.x + ambient.current.x;
    const oy = pan.current.y + ambient.current.y;

    // Hover is computed in the pointermove handler (not every frame).
    for (const t of tiles) {
      // Wrap each slot into the centered viewport range.
      let x = posMod(t.col * STRIDE + ox, totalW);
      if (x > totalW / 2) x -= totalW;
      let y = posMod(t.row * STRIDE + oy, totalH);
      if (y > totalH / 2) y -= totalH;

      // Per-tile entrance easing — outer tiles arrive slightly later, so the
      // whole field blooms outward from the center like the logo bursting.
      let ent = 1;
      if (globalP < 1) {
        const dist = Math.hypot(x, y);
        const delay = (dist / maxDist) * 0.35;
        const localP = Math.min(1, Math.max(0, (globalP - delay) / (1 - 0.35)));
        ent = 1 - Math.pow(1 - localP, 3); // easeOutCubic
      }

      t.mesh.position.x = x * ent;
      t.mesh.position.y = y * ent;

      // Recover the logical infinite cell coordinate to pick stable content.
      const cellX = Math.round((x - ox) / STRIDE);
      const cellY = Math.round((y - oy) / STRIDE);
      const content = posMod(cellX + cellY * CONTENT_SKEW, songs.length);

      if (content !== t.contentIndex) {
        t.contentIndex = content;
        const track = songs[content];
        const url =
          track?.album.images[1]?.url ?? track?.album.images[0]?.url ?? track?.album.images[2]?.url;
        const tex = getTexture(url) ?? placeholder;
        if (tex !== t.material.map) {
          t.material.map = tex;
          t.material.needsUpdate = true;
        }
      }

      // Scale: hovered tile grows, current-playing tile stays slightly larger.
      const isHovered = t.mesh.userData.poolIndex === hoveredTile.current;
      const isPlaying = currentTrackId && songs[t.contentIndex]?.id === currentTrackId;
      t.targetScale = isPlaying ? 1.14 : isHovered ? 1.12 : 1;
      t.scale = THREE.MathUtils.lerp(t.scale, t.targetScale, 0.12);
      t.mesh.scale.setScalar(t.scale * ent);

      // Dim everything a little more when something is playing so it pops.
      const anyPlaying = !!currentTrackId;
      const op = isPlaying ? 1 : isHovered ? 1 : anyPlaying ? 0.78 : 0.92;
      t.baseOpacity = THREE.MathUtils.lerp(t.baseOpacity, op, 0.1);
      t.material.opacity = t.baseOpacity * ent;

      if (isPlaying) playingPos = { x: x * ent, y: y * ent, scale: t.scale * ent };
    }

    // Position + pulse the glow halo behind the playing tile.
    if (playingPos) {
      const p = playingPos as { x: number; y: number; scale: number };
      glow.mesh.visible = true;
      glow.mesh.position.x = p.x;
      glow.mesh.position.y = p.y;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
      glow.mesh.scale.setScalar(p.scale * (1 + pulse * 0.08));
      glow.mat.opacity = THREE.MathUtils.lerp(glow.mat.opacity, 0.35 + pulse * 0.35, 0.2);
    } else {
      glow.mat.opacity = THREE.MathUtils.lerp(glow.mat.opacity, 0, 0.15);
      if (glow.mat.opacity < 0.01) glow.mesh.visible = false;
    }
  });

  return <group ref={groupRef} />;
}

interface PhantomGridProps {
  songs: SpotifyTrack[];
  onPlay: (track: SpotifyTrack) => void;
  currentTrackId?: string;
  burst?: boolean;
  onReady?: () => void;
}

export default function PhantomGrid({ songs, onPlay, currentTrackId, burst = true, onReady }: PhantomGridProps) {
  const distortionRef = useRef(
    typeof window !== 'undefined' && window.innerWidth < 640 ? 0.18 : 0.12
  );
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 4500);
    return () => clearTimeout(t);
  }, []);

  if (songs.length === 0) return null;

  return (
    <div className="fixed inset-0 z-0 cursor-grab active:cursor-grabbing">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#080808']} />
        <GridScene
          songs={songs}
          onPlay={onPlay}
          currentTrackId={currentTrackId}
          distortionRef={distortionRef}
          burst={burst}
          onReady={onReady}
        />
        <EffectComposer>
          <LensDistortion distortionRef={distortionRef} />
        </EffectComposer>
      </Canvas>

      {hint && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.3em] text-white/55 font-mono uppercase animate-pulse">
          Drag to explore · Scroll / pinch to zoom · Tap to play
        </div>
      )}
    </div>
  );
}
