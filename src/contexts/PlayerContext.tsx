'use client';

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import type { SpotifyTrack } from '@/types/spotify';
import { useMediaSession } from '@/hooks/useMediaSession';

interface PlayerState {
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  deviceId: string | null;
  playerError: string | null;
  queue: SpotifyTrack[];
  currentIndex: number;
  shuffle: boolean;
  showLyrics: boolean;
  showEqualizer: boolean;
  showNowPlaying: boolean;
}

interface PlayerActions {
  setIsPlaying: (v: boolean) => void;
  setPosition: (ms: number) => void;
  setVolume: (v: number) => void;
  toggleLyrics: () => void;
  toggleEqualizer: () => void;
  toggleNowPlaying: () => void;
  setShowNowPlaying: (v: boolean) => void;
  toggleShuffle: () => void;
  playTrack: (track: SpotifyTrack, context?: SpotifyTrack[]) => void;
  playNext: () => void;
  playPrev: () => void;
  upcoming: () => SpotifyTrack[];
  retryPlayer: () => void;
}

const PlayerContext = createContext<(PlayerState & PlayerActions) | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [queue, setQueue] = useState<SpotifyTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [shuffle, setShuffle] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);

  const playerRef = useRef<Spotify.Player | null>(null);
  const initialized = useRef(false);

  // Latest-value refs so the SDK listeners (registered once) can reach state.
  const queueRef = useRef<SpotifyTrack[]>([]);
  const indexRef = useRef(-1);
  const shuffleRef = useRef(false);
  const deviceIdRef = useRef<string | null>(null);
  const advancingRef = useRef(false);
  const lastPosRef = useRef(0);
  const readySeqRef = useRef(0); // bumps on every SDK 'ready' — lets reconnect waits know a fresh device registered
  const reconnectingRef = useRef(false); // guards the not_ready listener during a manual reconnect
  const recreatingRef = useRef(false); // guards against concurrent player re-creation
  const recreatePlayerRef = useRef<() => Promise<void>>(); // set after initPlayer; called from playUri
  const lastPlayUriRef = useRef<string | null>(null); // most recent intended track (for post-play verify)
  const hiddenAtRef = useRef(0); // timestamp the tab was last hidden (for focus recovery)
  const activatedRef = useRef(false);
  const deviceLessSinceRef = useRef(0); // when we entered a device-less state — absolute watchdog deadline

  // Mobile browsers block audio until the SDK's element is activated inside a
  // user gesture. Call this from the first tap that starts playback.
  const ensureActivated = useCallback(() => {
    if (activatedRef.current) return;
    const p = playerRef.current as unknown as { activateElement?: () => Promise<void> } | null;
    if (p?.activateElement) {
      activatedRef.current = true;
      p.activateElement().catch(() => {
        activatedRef.current = false;
      });
    }
  }, []);

  const currentTrackRef = useRef<SpotifyTrack | null>(null);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // Spotify drops idle web-playback devices after a while, leaving the cached
  // device_id stale. Force a FULL re-register — connect() alone often doesn't
  // fire a fresh 'ready' because the SDK still thinks it's connected even after
  // Spotify removed the device server-side. disconnect() then connect() does.
  const reconnectDevice = useCallback(() => {
    return new Promise<void>((resolve) => {
      const p = playerRef.current;
      if (!p) return resolve();
      const seq = readySeqRef.current;
      reconnectingRef.current = true;
      try {
        p.disconnect();
      } catch {
        /* ignore */
      }
      p.connect();
      const start = Date.now();
      const tick = () => {
        if (readySeqRef.current > seq || Date.now() - start > 6000) {
          reconnectingRef.current = false;
          resolve();
        } else {
          setTimeout(tick, 150);
        }
      };
      setTimeout(tick, 300);
    });
  }, []);

  const playUri = useCallback(
    async (uri: string, positionMs = 0) => {
      advancingRef.current = false;
      lastPosRef.current = 0;
      lastPlayUriRef.current = uri;
      const startAt = Math.max(0, Math.round(positionMs));

      const send = (devId: string) =>
        fetch(`/api/spotify/play?device_id=${devId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          // position_ms lets a resume-after-idle restart the track exactly where
          // it was paused, instead of from 0.
          body: JSON.stringify({ uris: [uri], position_ms: startAt }),
        });

      const attempt = async (): Promise<boolean> => {
        let id = deviceIdRef.current;
        if (!id) {
          await reconnectDevice();
          id = deviceIdRef.current;
        }
        if (id && (await send(id)).ok) return true;

        // Stale device after idle — re-register, then retry to beat the race
        // where Spotify hasn't accepted commands on the fresh device yet.
        await reconnectDevice();
        for (let i = 0; i < 3; i++) {
          const d = deviceIdRef.current;
          if (!d) break;
          if ((await send(d)).ok) return true;
          await new Promise((r) => setTimeout(r, 700));
        }

        // Still dead (long idle broke the SDK socket) — rebuild the player like
        // a reload would, then retry.
        if (recreatePlayerRef.current) {
          await recreatePlayerRef.current();
          for (let i = 0; i < 2; i++) {
            const d = deviceIdRef.current;
            if (!d) break;
            if ((await send(d)).ok) return true;
            await new Promise((r) => setTimeout(r, 800));
          }
        }
        return false;
      };

      const ok = await attempt();

      // The request can succeed against a "zombie" device (registered server-side
      // but with dead local audio after a very long idle) — UI shows playing but
      // there's no sound. Verify a moment later; if nothing actually started,
      // rebuild the player and replay once.
      if (ok) {
        setTimeout(async () => {
          if (lastPlayUriRef.current !== uri) return; // user moved on
          const st = await playerRef.current?.getCurrentState();
          const failed = !st || (st.paused && st.position < 500);
          if (failed && recreatePlayerRef.current) {
            await recreatePlayerRef.current();
            if (lastPlayUriRef.current !== uri) return;
            const d = deviceIdRef.current;
            if (d) send(d).catch(() => {});
          }
        }, 1500);
      }
    },
    [reconnectDevice]
  );

  const playIndex = useCallback(
    (i: number) => {
      const q = queueRef.current;
      if (i < 0 || i >= q.length) return;
      setCurrentIndex(i);
      indexRef.current = i;
      playUri(q[i].uri);
    },
    [playUri]
  );

  const playNext = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    let i: number;
    if (shuffleRef.current) {
      if (q.length === 1) i = 0;
      else {
        do {
          i = Math.floor(Math.random() * q.length);
        } while (i === indexRef.current);
      }
    } else {
      i = (indexRef.current + 1) % q.length;
    }
    playIndex(i);
  }, [playIndex]);

  const playPrev = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const i = (indexRef.current - 1 + q.length) % q.length;
    playIndex(i);
  }, [playIndex]);

  const playNextRef = useRef(playNext);
  useEffect(() => { playNextRef.current = playNext; }, [playNext]);

  const initPlayer = useCallback(async () => {
    if (initialized.current) return;
    initialized.current = true;

    const { token } = await fetch('/api/auth/token').then((r) => r.json()).catch(() => ({ token: null }));
    if (!token) {
      // Transient token failure — DON'T leave the latch set, or init never
      // retries and the UI is wedged on "Initializing player" forever.
      initialized.current = false;
      setPlayerError('reconnect');
      return;
    }

    const player = new window.Spotify.Player({
      name: 'Ode to Winamp',
      getOAuthToken: async (cb: (token: string) => void) => {
        const { token: freshToken } = await fetch('/api/auth/token').then((r) => r.json()).catch(() => ({ token }));
        cb(freshToken ?? token);
      },
      volume: 0.8,
    });

    player.addListener('ready', ({ device_id }: { device_id: string }) => {
      setDeviceId(device_id);
      deviceIdRef.current = device_id;
      readySeqRef.current += 1;
      setPlayerError(null);
    });

    player.addListener('not_ready', () => {
      // Spotify dropped the device (idle timeout / network). Re-register it so
      // the next play doesn't hit a dead device — unless a manual reconnect or a
      // full re-create is already in flight (avoid fighting / zombie players).
      if (reconnectingRef.current || recreatingRef.current) return;
      player.connect();
    });

    player.addListener('player_state_changed', (state: Spotify.PlaybackState | null) => {
      if (!state) {
        // A null state means another device took over playback — this device is
        // no longer the active output, so stop showing "playing".
        setIsPlaying(false);
        return;
      }
      const sdkTrack = state.track_window.current_track;
      setIsPlaying(!state.paused);
      setPosition(state.position);
      setDuration(state.duration);
      setCurrentTrack({
        id: sdkTrack.id ?? '',
        uri: sdkTrack.uri,
        name: sdkTrack.name,
        duration_ms: state.duration,
        artists: sdkTrack.artists.map((a) => ({ id: a.uri, name: a.name, uri: a.uri })),
        album: {
          id: sdkTrack.album.uri,
          name: sdkTrack.album.name,
          images: sdkTrack.album.images.map((img) => ({
            url: img.url,
            width: img.width ?? 0,
            height: img.height ?? 0,
          })),
          uri: sdkTrack.album.uri,
          release_date: '',
        },
        explicit: false,
        popularity: 0,
        preview_url: null,
      });

      // End-of-track detection: SDK pauses at position 0 once the single URI
      // finishes (we feed one URI at a time). Advance our own queue.
      if (
        state.paused &&
        state.position === 0 &&
        lastPosRef.current > 1000 &&
        !advancingRef.current
      ) {
        advancingRef.current = true;
        playNextRef.current();
      }
      lastPosRef.current = state.position;
    });

    player.addListener('account_error', ({ message }: { message: string }) => {
      console.error('Spotify account error (Premium required):', message);
      setPlayerError('Spotify Premium is required for playback.');
    });
    player.addListener('initialization_error', ({ message }: { message: string }) => {
      console.error('Spotify init error:', message);
      setPlayerError("This browser can't initialize the player.");
    });
    player.addListener('authentication_error', ({ message }: { message: string }) => {
      console.error('Spotify auth error:', message);
      // Let the next init re-create the player with a fresh token.
      initialized.current = false;
      setPlayerError('reconnect');
    });

    await player.connect();
    playerRef.current = player;
  }, []);

  // Re-download and re-run the Spotify SDK script from scratch. A new
  // Spotify.Player built from the already-loaded SDK reuses the SDK's global
  // connection state, which stays wedged after a long background — so a plain
  // rebuild won't recover, but a page refresh will. Re-injecting the script
  // re-initialises that global state: a reload without reloading.
  const reloadSdkScript = useCallback(() => {
    return new Promise<void>((resolve) => {
      document.getElementById('spotify-player-sdk')?.remove();
      // Drop the stale global so the re-injected script fully re-initialises
      // (and so any double-load guard inside the SDK doesn't short-circuit).
      try {
        delete (window as unknown as { Spotify?: unknown }).Spotify;
      } catch {
        (window as unknown as { Spotify?: unknown }).Spotify = undefined;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      // The SDK calls this once it has redefined window.Spotify.
      window.onSpotifyWebPlaybackSDKReady = finish;
      const script = document.createElement('script');
      script.id = 'spotify-player-sdk';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      script.onerror = finish;
      document.body.appendChild(script);
      // Don't hang the recovery forever if the ready callback never fires.
      setTimeout(finish, 6000);
    });
  }, []);

  // Nuclear recovery: after a long idle the SDK's socket/audio context can get
  // into a state where disconnect()+connect() — and even a new Player from the
  // same SDK — won't recover (only a page reload does). Tear down the player AND
  // reload the SDK script, then build a fresh player: a reload without reloading.
  const recreatePlayer = useCallback(async () => {
    if (recreatingRef.current) {
      const s = Date.now();
      while (recreatingRef.current && Date.now() - s < 14000) {
        await new Promise((r) => setTimeout(r, 150));
      }
      return;
    }
    recreatingRef.current = true;
    try {
      try {
        playerRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      deviceIdRef.current = null;
      setDeviceId(null);
      initialized.current = false;

      // Reload the SDK itself — the crucial step a plain rebuild was missing.
      await reloadSdkScript();
      if (typeof window === 'undefined' || !window.Spotify) {
        // SDK didn't come back in time — surface a retry rather than throwing.
        setPlayerError('slow');
        return;
      }

      await initPlayer();
      const start = Date.now();
      while (!deviceIdRef.current && Date.now() - start < 10000) {
        await new Promise((r) => setTimeout(r, 150));
      }
      // Re-arm audio on the freshly built player. A rebuild is normally
      // triggered from a play tap, so iOS still has transient user-activation
      // here — without this, the new audio element is never unlocked and
      // playback is silent even though the UI shows "playing".
      if (deviceIdRef.current) {
        activatedRef.current = false;
        ensureActivated();
      }
    } finally {
      recreatingRef.current = false;
    }
  }, [initPlayer, ensureActivated, reloadSdkScript]);

  recreatePlayerRef.current = recreatePlayer;

  // Manual retry from the UI when the player is stuck/errored.
  const retryPlayer = useCallback(() => {
    setPlayerError(null);
    recreatePlayerRef.current?.();
  }, []);

  // Watchdog: if no device registers within ~12s (and there's no hard error),
  // rebuild once; if it still doesn't come up, surface a retry instead of an
  // endless spinner. Catches mobile SDK hiccups + transient token failures.
  //
  // The deadline is anchored to an absolute "device-less since" timestamp, NOT
  // reset on every re-run. Otherwise a flapping deviceId (foreground events,
  // not_ready reconnects, rebuild churn) keeps clearing the timer and the user
  // is wedged on the spinner forever, never even reaching the Retry button.
  useEffect(() => {
    if (deviceId || playerError) {
      deviceLessSinceRef.current = 0;
      return;
    }
    if (!deviceLessSinceRef.current) deviceLessSinceRef.current = Date.now();
    const REBUILD_AT = 12000;
    const delay = Math.max(1000, REBUILD_AT - (Date.now() - deviceLessSinceRef.current));
    const t = setTimeout(async () => {
      if (deviceIdRef.current) return;
      await recreatePlayerRef.current?.();
      // One rescue attempt — if a device still didn't register, stop spinning
      // and give the user an actionable Retry rather than an endless spinner.
      if (!deviceIdRef.current) setPlayerError('slow');
    }, delay);
    return () => clearTimeout(t);
  }, [deviceId, playerError]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    // Define the global callback BEFORE the SDK script loads, otherwise the
    // SDK throws "onSpotifyWebPlaybackSDKReady is not defined" on load.
    window.onSpotifyWebPlaybackSDKReady = () => {
      initPlayer();
    };

    // Defer the ~30KB SDK download until we know the user is signed in, so the
    // login/intro launch path isn't competing for bandwidth.
    const loadSdkIfAuthed = async () => {
      if (window.Spotify) {
        initPlayer();
        return;
      }
      try {
        const res = await fetch('/api/auth/token');
        if (!res.ok) return; // not authenticated — skip the SDK entirely
        const { token } = await res.json().catch(() => ({ token: null }));
        if (!token) return;
      } catch {
        return;
      }
      if (cancelled || window.Spotify || document.getElementById('spotify-player-sdk')) return;
      const script = document.createElement('script');
      script.id = 'spotify-player-sdk';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    };
    loadSdkIfAuthed();

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
    };
  }, [initPlayer]);

  // Position polling drives the seek bar + near-end auto-advance fallback.
  useEffect(() => {
    if (!isPlaying || !playerRef.current) return;
    const interval = setInterval(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (!state) return;
      setPosition(state.position);
      lastPosRef.current = state.position;
      if (
        state.duration > 0 &&
        state.position >= state.duration - 700 &&
        !advancingRef.current
      ) {
        advancingRef.current = true;
        playNextRef.current();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Resync with reality when the app returns to the foreground. iOS suspends the
  // page and Spotify drops the device, leaving a stale "playing" UI; on a second
  // device the audio may live elsewhere. Reflect the SDK's actual state.
  useEffect(() => {
    // iOS freezes the page in the background and suspends/tears down the audio
    // element. Reset the activation latch so the NEXT play tap re-unlocks audio
    // inside a real user gesture — without this, a tap after idle plays in the
    // UI but stays silent (the rebuilt element was never re-armed by a gesture).
    const markHidden = () => {
      hiddenAtRef.current = Date.now();
      activatedRef.current = false;
    };

    const resync = async () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        markHidden();
        return;
      }
      const p = playerRef.current;
      if (!p) return;
      const hiddenMs = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = 0;

      let state = await p.getCurrentState();
      // After a long idle the web device is usually dropped. First try the cheap,
      // NON-destructive recovery: disconnect()+connect() on the existing player
      // re-registers the device while keeping the cached deviceId visible (no
      // "Initializing…" flash).
      const awayLimit = window.innerWidth < 640 ? 45 * 1000 : 5 * 60 * 1000;
      if (
        (!state || hiddenMs > awayLimit) &&
        !reconnectingRef.current &&
        !recreatingRef.current
      ) {
        await reconnectDevice();
        state = (await playerRef.current?.getCurrentState()) ?? null;

        // If a LONG idle left the device truly dead — reconnect couldn't revive
        // the SDK socket, so there's still no live state — rebuild the player
        // proactively NOW, while the user is looking at the UI. That way a fresh,
        // ready device exists BEFORE they tap play, so the tap can unlock audio
        // in-gesture instead of racing a multi-second rebuild (which on iOS
        // outlives the gesture's audio-activation window → silent playback). The
        // starvation-proof watchdog covers the case where this rebuild is slow.
        if (!state && hiddenMs > awayLimit && recreatePlayerRef.current) {
          await recreatePlayerRef.current();
          state = (await playerRef.current?.getCurrentState()) ?? null;
        }
      }

      if (!state) {
        setIsPlaying(false);
      } else {
        setIsPlaying(!state.paused);
        setPosition(state.position);
        setDuration(state.duration);
      }
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('pageshow', resync);
    // pagehide also fires when iOS sends the PWA to the background / bfcache.
    window.addEventListener('pagehide', markHidden);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('pageshow', resync);
      window.removeEventListener('pagehide', markHidden);
    };
  }, [reconnectDevice]);

  const playTrack = useCallback(
    (track: SpotifyTrack, context?: SpotifyTrack[]) => {
      // Must run synchronously inside the tap gesture to unlock mobile audio.
      ensureActivated();
      const q = context ?? queueRef.current;
      if (context) {
        setQueue(context);
        queueRef.current = context;
      }
      const idx = q.findIndex((t) => t.id === track.id);
      const finalIdx = idx >= 0 ? idx : 0;
      setCurrentIndex(finalIdx);
      indexRef.current = finalIdx;
      playUri(track.uri);
      // Auto-open the side lyrics panel when a song starts (desktop only — on
      // mobile the side panel would cover the screen; lyrics live in Now Playing).
      if (typeof window !== 'undefined' && window.innerWidth >= 640) {
        setShowLyrics(true);
      }
    },
    [playUri, ensureActivated]
  );

  const upcoming = useCallback(() => {
    const q = queueRef.current;
    const i = indexRef.current;
    if (q.length === 0 || i < 0) return [];
    return q.slice(i + 1, i + 1 + 30);
  }, []);

  // Play/pause with full mobile recovery. Shared by the UI controls AND the OS
  // Media Session (lock screen / Control Center) handlers.
  const togglePlay = useCallback(
    async (v: boolean) => {
      if (v) {
        ensureActivated();
        const state = await playerRef.current?.getCurrentState();
        // Capture the paused position BEFORE any recovery clears it.
        const resumeAt = lastPosRef.current;
        if (state && !state.paused) {
          // Already actually playing on this device — nothing to do.
        } else if (state) {
          // Live device with the track still loaded (short background) — a plain
          // resume works and keeps the exact position.
          await playerRef.current?.resume();
        } else {
          // No live state: the web device was dropped while backgrounded. Do NOT
          // bodyless-"resume" — after a long idle Spotify has discarded the paused
          // session, so resume hits a dead/empty context. Re-play the current
          // track at its last position through playUri, which carries the full
          // device-recovery ladder (reconnect → rebuild) and actually starts audio.
          const track = currentTrackRef.current;
          if (track) {
            await playUri(track.uri, resumeAt);
          } else {
            setIsPlaying(false);
            return;
          }
        }
      } else {
        await playerRef.current?.pause();
      }
      setIsPlaying(v);
    },
    [ensureActivated, playUri]
  );

  const seekTo = useCallback(async (ms: number) => {
    await playerRef.current?.seek(ms);
    setPosition(ms);
  }, []);

  // OS lock-screen / Control Center integration (extracted for clarity).
  useMediaSession(
    { currentTrack, isPlaying, position, duration },
    { togglePlay, playNext, playPrev, seekTo }
  );

  const value: PlayerState & PlayerActions = {
    currentTrack,
    isPlaying,
    position,
    duration,
    volume,
    deviceId,
    playerError,
    queue,
    currentIndex,
    shuffle,
    showLyrics,
    showEqualizer,
    showNowPlaying,
    retryPlayer,
    setIsPlaying: togglePlay,
    setPosition: seekTo,
    setVolume: async (v) => {
      await playerRef.current?.setVolume(v);
      setVolume(v);
    },
    toggleLyrics: () => setShowLyrics((p) => !p),
    toggleEqualizer: () => setShowEqualizer((p) => !p),
    toggleNowPlaying: () => setShowNowPlaying((p) => !p),
    setShowNowPlaying: (v) => setShowNowPlaying(v),
    toggleShuffle: () => setShuffle((p) => !p),
    playTrack,
    playNext,
    playPrev,
    upcoming,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be inside PlayerProvider');
  return ctx;
}
