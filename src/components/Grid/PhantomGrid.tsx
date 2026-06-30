'use client';

import { useRef, useMemo, useEffect, useState, useCallback, memo } from 'react';
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

// Cap the album-art cache so panning a big library can't grow VRAM without
// bound. Kept just above the full-zoom-out tile count (~170 desktop) so the whole
// on-screen field stays cached; eviction only fires while panning — which
// re-touches every on-screen tile first — so the LRU victim is always off-screen
// art. At the overview tiles load at 300px (see hires gating), so VRAM stays
// modest (~85MB) even full of textures.
const TEXTURE_CACHE_CAP = 200;

/** Shared, lazily-populated album-art texture cache (LRU-bounded). */
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
      const c = cache.current;
      const existing = c.get(url);
      if (existing) {
        // Re-insert to mark most-recently-used (Map preserves insertion order).
        c.delete(url);
        c.set(url, existing);
        return existing;
      }
      const tex = loader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      // Anisotropic filtering keeps art crisp where the lens distortion tilts and
      // minifies tiles — a big sharpness win for ~no cost (three clamps the value
      // to the GPU's max). Without it, the default anisotropy=1 leaves tiles soft.
      tex.anisotropy = 16;
      c.set(url, tex);
      if (c.size > TEXTURE_CACHE_CAP) {
        const oldest = c.keys().next().value as string | undefined;
        if (oldest !== undefined) {
          c.get(oldest)?.dispose();
          c.delete(oldest);
        }
      }
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

// Module-level so it survives a remount (e.g. a WebGL context loss/restore, which
// happens under GPU pressure in a browser tab): the burst-in entrance plays ONCE
// per page load, never again, so a context recovery doesn't re-blast the tiles.
// A real page reload re-imports this module and resets it, so the intro still
// plays on a genuine reload.
let gridHasEntered = false;

// Rough GPU-tier guess from CPU cores — the best easily-available, privacy-safe
// proxy in-browser (the actual GPU string is masked). Apple Silicon: M1/base ≈ 8
// cores, Pro/Max ≈ 10–16. Lower-tier machines open at a TIGHTER default zoom so
// the overview doesn't load enough tiles to pressure the GPU into losing the
// WebGL context (which was re-blasting the grid on an M1 Air, but not an M3 Pro).
// The full grand overview is still reachable by scrolling/pinching out.
function isHighGpuTier(): boolean {
  if (typeof navigator === 'undefined') return true;
  return (navigator.hardwareConcurrency || 8) >= 10;
}
function defaultZoomOut(mobile: boolean): number {
  if (isHighGpuTier()) return mobile ? 20 : 24; // grand overview
  return mobile ? 14 : 16; // moderate — far fewer tiles loaded
}

interface GridSceneProps {
  songs: SpotifyTrack[];
  onPlay: (track: SpotifyTrack) => void;
  onTileMenu?: (track: SpotifyTrack, clientX: number, clientY: number) => void; // right-click → open menu
  currentTrackId?: string;
  distortionRef: React.MutableRefObject<number>;
  burst: boolean;
  onReady?: () => void;
  paused?: boolean;
  onActivity?: () => void; // signal interaction so the wrapper keeps the render loop awake
}

function GridScene({ songs, onPlay, onTileMenu, currentTrackId, distortionRef, burst, onReady, paused, onActivity }: GridSceneProps) {
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
  // Most zoomed-OUT: pulled far enough back to reveal a grand, sweeping curved
  // wall of album art (the lens distortion reads stronger the more is in view).
  // The recycled tile pool auto-sizes to this, and TEXTURE_CACHE_CAP is set above
  // the resulting tile count so nothing on screen gets evicted at full zoom-out.
  const ZOOM_MAX = isMobile ? 20 : 24; // most zoomed-out (camera farthest)

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
  // Open zoomed out — the grand overview on capable GPUs, a tighter view on
  // weaker ones (see defaultZoomOut). The user can scroll/pinch from there.
  const zoomRef = useRef(defaultZoomOut(isMobile)); // target camera z
  const pinchingRef = useRef(false); // a two-finger pinch is in progress

  // Keyboard selection cursor: a focus ring hops album-to-album with the arrow
  // keys, the camera eases to keep it centered, Enter/Space plays it. Tracks a
  // logical infinite-lattice cell; deactivated as soon as the mouse takes over.
  const selCell = useRef<{ cx: number; cy: number } | null>(null);
  const selActive = useRef(false);
  const panTarget = useRef<{ x: number; y: number } | null>(null);

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

  // Keyboard focus ring — a crisp white rounded-rect outline that frames the
  // selected tile (deliberately not teal, to read as "focus" vs the now-playing
  // glow). Drawn to a canvas texture so the border has real thickness.
  const focusRing = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const inset = 16;
    const r = 26;
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = 'rgba(0,216,216,0.9)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(inset + r, inset);
    ctx.arcTo(256 - inset, inset, 256 - inset, 256 - inset, r);
    ctx.arcTo(256 - inset, 256 - inset, inset, 256 - inset, r);
    ctx.arcTo(inset, 256 - inset, inset, inset, r);
    ctx.arcTo(inset, inset, 256 - inset, inset, r);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 1.16, TILE * 1.16), mat);
    mesh.position.z = 0.06;
    mesh.visible = false;
    return { mesh, mat, tex };
  }, [TILE]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    tiles.forEach((t) => group.add(t.mesh));
    group.add(glow.mesh);
    group.add(focusRing.mesh);
    return () => {
      tiles.forEach((t) => {
        group.remove(t.mesh);
        t.material.dispose();
      });
      group.remove(glow.mesh);
      glow.mat.dispose();
      group.remove(focusRing.mesh);
      focusRing.mat.dispose();
      focusRing.tex.dispose();
    };
  }, [tiles, glow, focusRing]);

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
      // Only the left button starts a drag/tap. Without this a right-click also
      // registered as a tap and played the song (in addition to opening the menu).
      if (e.button !== 0) return;
      onActivity?.();
      selActive.current = false; // mouse takes over from keyboard selection
      panTarget.current = null;
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
        // Real pointer movement hands control back to the mouse.
        selActive.current = false;
        panTarget.current = null;
        // Hover detection here (on actual pointer movement) instead of raycasting
        // every frame — far cheaper when the pointer is still.
        const tile = tileUnderPointer(e.clientX, e.clientY);
        const next = tile ? (tile.mesh.userData.poolIndex as number) : -1;
        // Only wake the render loop when the hovered tile actually changes, so a
        // still mouse (or one moving over other UI) doesn't keep the grid drawing.
        if (next !== hoveredTile.current) {
          hoveredTile.current = next;
          onActivity?.();
        }
        return;
      }
      onActivity?.(); // active drag — keep the loop awake
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
      onActivity?.();
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
        onActivity?.();
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinchingRef.current || e.touches.length !== 2) return;
      e.preventDefault();
      onActivity?.();
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

    // Right-click a tile → open the tile menu at the cursor (suppress the
    // browser's context menu). No-op on empty space.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!onTileMenu) return;
      const tile = tileUnderPointer(e.clientX, e.clientY);
      if (tile && tile.contentIndex >= 0) {
        const track = songs[tile.contentIndex % songs.length];
        if (track) onTileMenu(track, e.clientX, e.clientY);
      }
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [gl, camera, pxToWorld, distortionRef, tileUnderPointer, songs, onPlay, onTileMenu, onActivity, REST_DIST, DRAG_DIST, ZOOM_MIN, ZOOM_MAX]);

  // Keyboard selection: arrows move a focus cursor cell-by-cell, Enter/Space
  // plays the selected album. Centers the selection by easing the pan (useFrame).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || songs.length === 0) return;
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const isArrow =
        e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown';
      const isPlayKey = e.key === 'Enter' || e.key === ' ';

      if (isArrow || isPlayKey || e.key === 'Escape') onActivity?.();

      if (isArrow) {
        e.preventDefault();
        // Engage from the cell currently at screen centre on first press.
        if (!selActive.current || !selCell.current) {
          const ox = pan.current.x + ambient.current.x;
          const oy = pan.current.y + ambient.current.y;
          selCell.current = { cx: Math.round(-ox / STRIDE), cy: Math.round(-oy / STRIDE) };
          selActive.current = true;
        }
        const c = selCell.current;
        if (e.key === 'ArrowLeft') c.cx -= 1;
        else if (e.key === 'ArrowRight') c.cx += 1;
        else if (e.key === 'ArrowUp') c.cy += 1; // world +y is up
        else if (e.key === 'ArrowDown') c.cy -= 1;
        panTarget.current = { x: -c.cx * STRIDE, y: -c.cy * STRIDE };
        return;
      }

      if (isPlayKey && selActive.current && selCell.current) {
        e.preventDefault();
        const content = posMod(selCell.current.cx + selCell.current.cy * CONTENT_SKEW, songs.length);
        const track = songs[content];
        if (track) onPlay(track);
        return;
      }

      if (e.key === 'Escape' && selActive.current) {
        selActive.current = false;
        panTarget.current = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, songs, onPlay, STRIDE, onActivity]);

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
    // If we've already entered once this page load, start the clock in the past
    // so globalP is 1 immediately — tiles appear settled, no replayed burst.
    if (burst && entranceStart.current < 0) {
      entranceStart.current = gridHasEntered ? time - ENTRANCE_DURATION - 1 : time;
    }
    const globalP =
      entranceStart.current < 0 ? 0 : Math.min(1, (time - entranceStart.current) / ENTRANCE_DURATION);
    if (globalP >= 1) gridHasEntered = true;
    const maxDist = Math.max(1, Math.hypot(viewport.width / 2, viewport.height / 2));
    // Inertia: keep gliding after release, damping velocity toward 0 at 0.1.
    // When the keyboard cursor is active, ease the pan to centre the selection
    // instead (and kill any leftover inertia so they don't fight).
    if (!dragging.current) {
      if (selActive.current && panTarget.current) {
        pan.current.x = THREE.MathUtils.lerp(pan.current.x, panTarget.current.x, 0.16);
        pan.current.y = THREE.MathUtils.lerp(pan.current.y, panTarget.current.y, 0.16);
        vel.current.x = 0;
        vel.current.y = 0;
      } else {
        pan.current.x += vel.current.x;
        pan.current.y += vel.current.y;
        vel.current.x = THREE.MathUtils.lerp(vel.current.x, 0, 0.1);
        vel.current.y = THREE.MathUtils.lerp(vel.current.y, 0, 0.1);
      }
    }

    // Ambient parallax — drift opposite to the cursor, eased.
    ambient.current.x = THREE.MathUtils.lerp(ambient.current.x, -pointerNorm.current.x * 0.35, 0.05);
    ambient.current.y = THREE.MathUtils.lerp(ambient.current.y, -pointerNorm.current.y * 0.35, 0.05);

    const ox = pan.current.x + ambient.current.x;
    const oy = pan.current.y + ambient.current.y;

    // Selected song (keyboard cursor) — used to frame + enlarge that tile.
    const selContent =
      selActive.current && selCell.current
        ? posMod(selCell.current.cx + selCell.current.cy * CONTENT_SKEW, songs.length)
        : -1;
    let selScale = 1;

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
        // Spotify orders images largest-first (640 → 300 → 64). Use the 640px art
        // only when zoomed IN (few, large tiles); at the zoomed-out overview the
        // ~170 small tiles would pin ~370MB of VRAM (640px is ~4.5× the bytes of
        // 300px), which under GPU pressure in a browser tab was losing the WebGL
        // context and re-blasting the grid. Small tiles look fine at 300px.
        const imgs = track?.album.images;
        const hires = !isMobile && zoomRef.current < 13;
        const url = hires
          ? imgs?.[0]?.url ?? imgs?.[1]?.url ?? imgs?.[2]?.url
          : imgs?.[1]?.url ?? imgs?.[0]?.url ?? imgs?.[2]?.url;
        const tex = getTexture(url) ?? placeholder;
        if (tex !== t.material.map) {
          t.material.map = tex;
          t.material.needsUpdate = true;
        }
      }

      // Scale: selected/hovered tile grows, current-playing tile stays larger.
      // The mouse hover is suppressed while the keyboard cursor is active.
      const isHovered = !selActive.current && t.mesh.userData.poolIndex === hoveredTile.current;
      const isPlaying = currentTrackId && songs[t.contentIndex]?.id === currentTrackId;
      const isSelected = selContent >= 0 && t.contentIndex === selContent;
      t.targetScale = isSelected ? 1.16 : isPlaying ? 1.14 : isHovered ? 1.12 : 1;
      t.scale = THREE.MathUtils.lerp(t.scale, t.targetScale, 0.12);
      t.mesh.scale.setScalar(t.scale * ent);

      // Dim everything a little more when something is playing so it pops.
      const anyPlaying = !!currentTrackId;
      const op = isPlaying || isSelected || isHovered ? 1 : anyPlaying ? 0.78 : 0.92;
      t.baseOpacity = THREE.MathUtils.lerp(t.baseOpacity, op, 0.1);
      t.material.opacity = t.baseOpacity * ent;

      if (isPlaying) playingPos = { x: x * ent, y: y * ent, scale: t.scale * ent };
      if (isSelected) selScale = t.scale * ent;
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

    // Keyboard focus ring — frame the selected cell (computed directly from the
    // selection so it's robust to tile recycling), gliding to centre with it.
    if (selContent >= 0 && selCell.current) {
      let fx = posMod(selCell.current.cx * STRIDE + ox, totalW);
      if (fx > totalW / 2) fx -= totalW;
      let fy = posMod(selCell.current.cy * STRIDE + oy, totalH);
      if (fy > totalH / 2) fy -= totalH;
      focusRing.mesh.visible = true;
      focusRing.mesh.position.x = fx;
      focusRing.mesh.position.y = fy;
      focusRing.mesh.scale.setScalar(selScale || 1);
      focusRing.mat.opacity = THREE.MathUtils.lerp(focusRing.mat.opacity, 0.95, 0.25);
    } else {
      focusRing.mat.opacity = THREE.MathUtils.lerp(focusRing.mat.opacity, 0, 0.2);
      if (focusRing.mat.opacity < 0.01) focusRing.mesh.visible = false;
    }
  });

  return <group ref={groupRef} />;
}

interface PhantomGridProps {
  songs: SpotifyTrack[];
  onPlay: (track: SpotifyTrack) => void;
  onTileMenu?: (track: SpotifyTrack, clientX: number, clientY: number) => void;
  currentTrackId?: string;
  isPlaying?: boolean;
  burst?: boolean;
  onReady?: () => void;
  /** When true (e.g. full-screen Now Playing covers the grid) the WebGL render
   *  loop is suspended to save GPU/battery on mobile. */
  paused?: boolean;
}

function PhantomGrid({ songs, onPlay, onTileMenu, currentTrackId, isPlaying = false, burst = true, onReady, paused = false }: PhantomGridProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const distortionRef = useRef(isMobile ? 0.18 : 0.12);
  const [hint, setHint] = useState(true);

  // Activity-driven render loop. The grid only needs continuous frames while a
  // song is playing (the glow halo pulses) or the user is interacting (drag,
  // zoom, hover, keyboard, entrance). When paused AND idle there's nothing to
  // animate, so we drop the loop to 'never' and the GPU goes quiet instead of
  // burning 60fps forever. Start awake so the entrance burst renders.
  const [interacting, setInteracting] = useState(true);
  const settleRef = useRef<ReturnType<typeof setTimeout>>();
  const onActivity = useCallback(() => {
    setInteracting(true); // no-op re-render if already true
    if (settleRef.current) clearTimeout(settleRef.current);
    // Outlast pan inertia + the distortion tween (~1s) so motion finishes before
    // we sleep; a flick won't freeze mid-glide.
    settleRef.current = setTimeout(() => setInteracting(false), 3000);
  }, []);

  // Wake for one settle window whenever the scene meaningfully changes while
  // otherwise idle (first mount/entrance, library swap, selection change).
  useEffect(() => {
    onActivity();
    return () => {
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, [songs, currentTrackId, onActivity]);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 4500);
    return () => clearTimeout(t);
  }, []);

  if (songs.length === 0) return null;

  // Render only when there's something to animate; suspend entirely when the
  // grid is hidden behind a full-screen panel.
  const live = !paused && (isPlaying || interacting);

  return (
    <div className="fixed inset-0 z-0 cursor-grab active:cursor-grabbing">
      <Canvas
        frameloop={live ? 'always' : 'never'}
        camera={{
          // Match GridScene's default zoom (capability-aware) so the grid opens
          // at the right level with no initial dolly.
          position: [0, 0, defaultZoomOut(isMobile)],
          fov: 45,
          near: 0.1,
          far: 100,
        }}
        // Antialiasing + high DPR are the biggest GPU costs; cap DPR at 1.5 on
        // phones and lower-tier GPUs (and drop MSAA on phones) to ease pressure.
        gl={{ antialias: !isMobile, alpha: true, powerPreference: 'high-performance' }}
        dpr={isMobile || !isHighGpuTier() ? [1, 1.5] : [1, 2]}
        onCreated={({ gl }) => {
          // Under GPU pressure in a browser tab the context can be lost; calling
          // preventDefault lets the browser RESTORE it (otherwise it stays blank).
          gl.domElement.addEventListener(
            'webglcontextlost',
            (e) => e.preventDefault(),
            false
          );
        }}
      >
        <color attach="background" args={['#080808']} />
        <GridScene
          songs={songs}
          onPlay={onPlay}
          onTileMenu={onTileMenu}
          currentTrackId={currentTrackId}
          distortionRef={distortionRef}
          burst={burst}
          onReady={onReady}
          paused={paused}
          onActivity={onActivity}
        />
        <EffectComposer>
          <LensDistortion distortionRef={distortionRef} />
        </EffectComposer>
      </Canvas>

      {hint && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.3em] text-white/55 font-mono uppercase animate-pulse">
          Drag or arrow keys to explore · Scroll / pinch to zoom · Tap or Enter to play
        </div>
      )}
    </div>
  );
}

// Memoised so the player's ~2x/sec state ticks (position) don't re-run the grid
// component — its props are referentially stable (songs frozen, callbacks
// useCallback'd), so it only re-renders when they actually change.
export default memo(PhantomGrid);
