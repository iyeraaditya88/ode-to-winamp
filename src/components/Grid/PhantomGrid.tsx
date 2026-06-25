'use client';

import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import gsap from 'gsap';
import { LensDistortion } from './LensDistortion';
import type { SpotifyTrack } from '@/types/spotify';

const STRIDE = 2.45; // world-space distance between tile centers (tighter = more songs in view)
const TILE = 2.0; // tile size (square)
const CONTENT_SKEW = 7; // de-correlates rows so neighbours differ

// Camera + curvature tuning. Drag values deepen the effect while interacting.
const CAMERA_Z = 13; // pulled back for a wider field of view
const CAMERA_Z_DRAG = 14.5;
const DISTORTION_REST = 0.2; // stronger barrel curve at rest
const DISTORTION_DRAG = 0.38;

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
}

interface GridSceneProps {
  songs: SpotifyTrack[];
  onPlay: (track: SpotifyTrack) => void;
  currentTrackId?: string;
  distortionRef: React.MutableRefObject<number>;
}

function GridScene({ songs, onPlay, currentTrackId, distortionRef }: GridSceneProps) {
  const { viewport, size, camera, gl } = useThree();
  const getTexture = useTextureCache();
  const groupRef = useRef<THREE.Group>(null);

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

  // Build the recycled tile pool sized to cover the viewport + margin.
  const cols = Math.ceil(viewport.width / STRIDE) + 4;
  const rows = Math.ceil(viewport.height / STRIDE) + 4;

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
        out.push({ mesh, material, col: c, row: r, contentIndex: -1, targetScale: 1, scale: 1 });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows, placeholder]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    tiles.forEach((t) => group.add(t.mesh));
    return () => {
      tiles.forEach((t) => {
        group.remove(t.mesh);
        t.material.dispose();
      });
    };
  }, [tiles]);

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
      dragging.current = true;
      moved.current = 0;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      downPointer.current = { x: e.clientX, y: e.clientY };
      vel.current = { x: 0, y: 0 };
      el.setPointerCapture(e.pointerId);
      // Push the camera back + deepen curvature while interacting.
      gsap.to(camera.position, { z: CAMERA_Z_DRAG, duration: 1, ease: 'power3.out' });
      gsap.to(distortionRef, { current: DISTORTION_DRAG, duration: 1, ease: 'power2.out' });
    };

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      pointerNorm.current = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };

      if (!dragging.current) return;
      const dx = (e.clientX - lastPointer.current.x) * pxToWorld;
      const dy = -(e.clientY - lastPointer.current.y) * pxToWorld;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      moved.current += Math.abs(e.clientX - downPointer.current.x) + Math.abs(e.clientY - downPointer.current.y);

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
      gsap.to(camera.position, { z: CAMERA_Z, duration: 1, ease: 'power3.out' });
      gsap.to(distortionRef, { current: DISTORTION_REST, duration: 1, ease: 'power2.out' });

      // A near-stationary press is a click → play that tile's track.
      if (moved.current < 6) {
        const tile = tileUnderPointer(e.clientX, e.clientY);
        if (tile && tile.contentIndex >= 0) {
          const track = songs[tile.contentIndex % songs.length];
          if (track) onPlay(track);
        }
      }
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera, pxToWorld, distortionRef, tileUnderPointer, songs, onPlay]);

  const totalW = cols * STRIDE;
  const totalH = rows * STRIDE;

  useFrame(() => {
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

    // Hover detection (only when not dragging) for subtle scale-up.
    let hoverContent = -1;
    if (!dragging.current) {
      const tile = tileUnderPointer(
        ((pointerNorm.current.x + 1) / 2) * size.width + gl.domElement.getBoundingClientRect().left,
        ((1 - pointerNorm.current.y) / 2) * size.height + gl.domElement.getBoundingClientRect().top
      );
      hoveredTile.current = tile ? tile.mesh.userData.poolIndex : -1;
    } else {
      hoveredTile.current = -1;
    }

    for (const t of tiles) {
      // Wrap each slot into the centered viewport range.
      let x = posMod(t.col * STRIDE + ox, totalW);
      if (x > totalW / 2) x -= totalW;
      let y = posMod(t.row * STRIDE + oy, totalH);
      if (y > totalH / 2) y -= totalH;

      t.mesh.position.x = x;
      t.mesh.position.y = y;

      // Recover the logical infinite cell coordinate to pick stable content.
      const cellX = Math.round((x - ox) / STRIDE);
      const cellY = Math.round((y - oy) / STRIDE);
      const content = posMod(cellX + cellY * CONTENT_SKEW, songs.length);

      if (content !== t.contentIndex) {
        t.contentIndex = content;
        const track = songs[content];
        const url =
          track?.album.images[1]?.url ?? track?.album.images[0]?.url ?? track?.album.images[2]?.url;
        const tex = getTexture(url);
        t.material.map = tex ?? placeholder;
        t.material.needsUpdate = true;
        hoverContent = content;
      }

      // Scale: hovered tile grows, current-playing tile stays slightly larger.
      const isHovered = t.mesh.userData.poolIndex === hoveredTile.current;
      const isPlaying = currentTrackId && songs[t.contentIndex]?.id === currentTrackId;
      t.targetScale = isHovered ? 1.12 : isPlaying ? 1.06 : 1;
      t.scale = THREE.MathUtils.lerp(t.scale, t.targetScale, 0.12);
      t.mesh.scale.setScalar(t.scale);

      // Dim non-playing tiles a touch so the active one reads.
      const op = isPlaying ? 1 : isHovered ? 1 : 0.92;
      t.material.opacity = THREE.MathUtils.lerp(t.material.opacity, op, 0.1);
    }

    void hoverContent;
  });

  return <group ref={groupRef} />;
}

interface PhantomGridProps {
  songs: SpotifyTrack[];
  onPlay: (track: SpotifyTrack) => void;
  currentTrackId?: string;
}

export default function PhantomGrid({ songs, onPlay, currentTrackId }: PhantomGridProps) {
  const distortionRef = useRef(DISTORTION_REST);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 4500);
    return () => clearTimeout(t);
  }, []);

  if (songs.length === 0) return null;

  return (
    <div className="fixed inset-0 z-0 cursor-grab active:cursor-grabbing">
      <Canvas
        camera={{ position: [0, 0, CAMERA_Z], fov: 58, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#080808']} />
        <GridScene
          songs={songs}
          onPlay={onPlay}
          currentTrackId={currentTrackId}
          distortionRef={distortionRef}
        />
        <EffectComposer>
          <LensDistortion distortionRef={distortionRef} />
        </EffectComposer>
      </Canvas>

      {hint && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.3em] text-white/30 font-mono uppercase animate-pulse">
          Drag to explore · Click to play
        </div>
      )}
    </div>
  );
}
