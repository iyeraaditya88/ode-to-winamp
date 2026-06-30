'use client';

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import type { SpotifyTrack } from '@/types/spotify';
import { useMediaSession } from '@/hooks/useMediaSession';
import { plog } from '@/lib/playerLog';

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
  userQueue: SpotifyTrack[]; // explicitly queued "play next" tracks (drain before the context continues)
  shuffle: boolean;
  showLyrics: boolean;
  showQueue: boolean;
  showEqualizer: boolean;
  showNowPlaying: boolean;
}

interface PlayerActions {
  setIsPlaying: (v: boolean) => void;
  setPosition: (ms: number) => void;
  setVolume: (v: number) => void;
  toggleLyrics: () => void;
  toggleQueue: () => void;
  toggleEqualizer: () => void;
  toggleNowPlaying: () => void;
  setShowNowPlaying: (v: boolean) => void;
  toggleShuffle: () => void;
  playTrack: (track: SpotifyTrack, context?: SpotifyTrack[]) => void;
  queueTrack: (track: SpotifyTrack) => void; // add to the "play next" queue
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
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
  const [userQueue, setUserQueue] = useState<SpotifyTrack[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);

  const playerRef = useRef<Spotify.Player | null>(null);
  const initialized = useRef(false);

  // Latest-value refs so the SDK listeners (registered once) can reach state.
  const queueRef = useRef<SpotifyTrack[]>([]);
  const indexRef = useRef(-1);
  const userQueueRef = useRef<SpotifyTrack[]>([]);
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
  const toggleBusyRef = useRef(false); // a play/pause toggle is resolving — coalesce stacked taps

  // Mobile browsers block audio until the SDK's element is activated inside a
  // user gesture. Call this from the first tap that starts playback.
  const ensureActivated = useCallback(() => {
    if (activatedRef.current) return;
    const p = playerRef.current as unknown as { activateElement?: () => Promise<void> } | null;
    if (p?.activateElement) {
      activatedRef.current = true;
      plog('activate', 'activateElement()');
      p.activateElement().catch(() => {
        activatedRef.current = false;
        plog('activate', 'activateElement FAILED');
      });
    }
  }, []);

  const currentTrackRef = useRef<SpotifyTrack | null>(null);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  const showQueueRef = useRef(false);
  useEffect(() => { showQueueRef.current = showQueue; }, [showQueue]);

  // Spotify drops idle web-playback devices after a while, leaving the cached
  // device_id stale. Force a FULL re-register — connect() alone often doesn't
  // fire a fresh 'ready' because the SDK still thinks it's connected even after
  // Spotify removed the device server-side. disconnect() then connect() does.
  const reconnectDevice = useCallback(() => {
    return new Promise<void>((resolve) => {
      if (recreatingRef.current) {
        // A full rebuild is in flight — don't disconnect()/connect() the player
        // it's building, or we double-register the device and fire duplicate
        // ready/state events. The rebuild will produce a fresh ready device.
        plog('reconnect', 'skip (recreate in flight)');
        return resolve();
      }
      const p = playerRef.current;
      if (!p) {
        plog('reconnect', 'no player');
        return resolve();
      }
      const seq = readySeqRef.current;
      reconnectingRef.current = true;
      plog('reconnect', 'disconnect()+connect()');
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
          plog('reconnect', readySeqRef.current > seq ? `fresh ready (${Date.now() - start}ms)` : 'TIMEOUT 6s, no ready');
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
      plog('playUri', `pos=${startAt} dev=${deviceIdRef.current ? deviceIdRef.current.slice(0, 6) : 'none'}`);

      const send = async (devId: string) => {
        const res = await fetch(`/api/spotify/play?device_id=${devId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          // position_ms lets a resume-after-idle restart the track exactly where
          // it was paused, instead of from 0.
          body: JSON.stringify({ uris: [uri], position_ms: startAt }),
        });
        plog('send', `dev=${devId.slice(0, 6)} -> ${res.status}${res.ok ? ' ok' : ''}`);
        return res;
      };

      const attempt = async (): Promise<boolean> => {
        // If a rebuild is already in flight (the proactive foreground recreate),
        // WAIT for it and use its fresh device — don't race a second recovery.
        // Racing caused concurrent connect()s, a double-registered device, and a
        // slow ~3s "UI playing but silent" gap after returning from background.
        if (recreatingRef.current) {
          plog('attempt', 'recreate in flight — waiting for it');
          const s = Date.now();
          while (recreatingRef.current && Date.now() - s < 12000) {
            await new Promise((r) => setTimeout(r, 100));
          }
          plog('attempt', `recreate done, dev=${deviceIdRef.current ? deviceIdRef.current.slice(0, 6) : 'none'}`);
        }

        let id = deviceIdRef.current;
        if (!id) {
          plog('attempt', 'no device, reconnect first');
          await reconnectDevice();
          id = deviceIdRef.current;
        }
        if (id && (await send(id)).ok) return true;

        // Stale device after idle — re-register, then retry to beat the race
        // where Spotify hasn't accepted commands on the fresh device yet.
        plog('attempt', 'first send failed -> reconnect + retry x3');
        await reconnectDevice();
        for (let i = 0; i < 3; i++) {
          const d = deviceIdRef.current;
          if (!d) break;
          if ((await send(d)).ok) return true;
          await new Promise((r) => setTimeout(r, 700));
        }

        // Still dead (long idle broke the SDK socket) — rebuild the player like
        // a reload would, then retry.
        plog('attempt', 'still failing -> recreatePlayer + retry x2');
        if (recreatePlayerRef.current) {
          await recreatePlayerRef.current();
          for (let i = 0; i < 2; i++) {
            const d = deviceIdRef.current;
            if (!d) break;
            if ((await send(d)).ok) return true;
            await new Promise((r) => setTimeout(r, 800));
          }
        }
        plog('attempt', 'FAILED — no device accepted play');
        return false;
      };

      const ok = await attempt();

      // The request can succeed against a "zombie" device (registered server-side
      // but with dead local audio after a very long idle) — the SDK may even
      // report "playing" while no sound comes out. Confirm a REAL start by
      // watching the position ADVANCE past the start point over a short window.
      // A single early snapshot would false-positive on normal buffering and tear
      // down a play that was about to start — which showed up as the first play
      // briefly "playing" then pausing itself ~2s later.
      plog('playUri', `attempt -> ${ok ? 'ok' : 'FAILED'}`);
      if (ok) {
        void (async () => {
          let progressed = false;
          for (let i = 0; i < 4; i++) {
            await new Promise((r) => setTimeout(r, 900));
            if (lastPlayUriRef.current !== uri) {
              plog('verify', 'aborted (user moved on)');
              return; // user moved on
            }
            const st = await playerRef.current?.getCurrentState();
            plog('verify', `#${i} paused=${st?.paused ?? 'null'} pos=${st?.position ?? '-'} (need >${startAt + 250})`);
            if (st && !st.paused && st.position > startAt + 250) {
              progressed = true;
              break;
            }
          }
          if (!progressed && lastPlayUriRef.current === uri && recreatePlayerRef.current) {
            plog('verify', 'NO progress -> recreate + replay (this is the self-pause)');
            await recreatePlayerRef.current();
            if (lastPlayUriRef.current !== uri) return;
            const d = deviceIdRef.current;
            if (d) send(d).catch(() => {});
          } else {
            plog('verify', progressed ? 'progress confirmed, audio playing' : 'skipped recreate');
          }
        })();
      }
    },
    [reconnectDevice]
  );

  // Reflect the selected track in the UI immediately, before the SDK round-trips
  // and fires player_state_changed. The art/title, reset progress bar and lyrics
  // fetch all light up on tap instead of after the network + buffer delay, so
  // playback *feels* instant even while Spotify is still loading the audio. The
  // real state_changed reconciles these moments later.
  const showTrackOptimistically = useCallback((track: SpotifyTrack) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setPosition(0);
    setDuration(track.duration_ms);
    lastPosRef.current = 0;
  }, []);

  const playIndex = useCallback(
    (i: number) => {
      const q = queueRef.current;
      if (i < 0 || i >= q.length) return;
      setCurrentIndex(i);
      indexRef.current = i;
      showTrackOptimistically(q[i]);
      playUri(q[i].uri);
    },
    [playUri, showTrackOptimistically]
  );

  // Add a track to the "play next" queue. These drain (FIFO) before the grid
  // context continues, and take priority over shuffle.
  const queueTrack = useCallback((track: SpotifyTrack) => {
    userQueueRef.current = [...userQueueRef.current, track];
    setUserQueue(userQueueRef.current);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    userQueueRef.current = userQueueRef.current.filter((_, i) => i !== index);
    setUserQueue(userQueueRef.current);
  }, []);

  const reorderQueue = useCallback((from: number, to: number) => {
    const q = [...userQueueRef.current];
    if (from < 0 || from >= q.length || to < 0 || to >= q.length || from === to) return;
    const [moved] = q.splice(from, 1);
    q.splice(to, 0, moved);
    userQueueRef.current = q;
    setUserQueue(q);
  }, []);

  const playNext = useCallback(() => {
    // User-queued tracks play first and DON'T move the context cursor, so once
    // the queue drains playback resumes the grid sequence where it left off.
    if (userQueueRef.current.length > 0) {
      const [next, ...rest] = userQueueRef.current;
      userQueueRef.current = rest;
      setUserQueue(rest);
      showTrackOptimistically(next);
      playUri(next.uri);
      return;
    }
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
  }, [playIndex, showTrackOptimistically, playUri]);

  const playPrev = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const i = (indexRef.current - 1 + q.length) % q.length;
    playIndex(i);
  }, [playIndex]);

  const playNextRef = useRef(playNext);
  useEffect(() => { playNextRef.current = playNext; }, [playNext]);

  const initPlayer = useCallback(async () => {
    if (initialized.current) {
      plog('initPlayer', 'skip (already initialized)');
      return;
    }
    initialized.current = true;
    plog('initPlayer', 'start');

    const { token } = await fetch('/api/auth/token').then((r) => r.json()).catch(() => ({ token: null }));
    if (!token) {
      // Transient token failure — DON'T leave the latch set, or init never
      // retries and the UI is wedged on "Initializing player" forever.
      initialized.current = false;
      plog('initPlayer', 'NO TOKEN -> error reconnect');
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
      plog('sdk:ready', device_id.slice(0, 6));
      setDeviceId(device_id);
      deviceIdRef.current = device_id;
      readySeqRef.current += 1;
      setPlayerError(null);
    });

    player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
      plog('sdk:not_ready', `${device_id?.slice(0, 6)} reconn=${reconnectingRef.current} recr=${recreatingRef.current}`);
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
        plog('sdk:state', 'NULL (device not active output)');
        setIsPlaying(false);
        return;
      }
      const sdkTrack = state.track_window.current_track;
      plog('sdk:state', `paused=${state.paused} pos=${state.position} "${sdkTrack.name?.slice(0, 20)}"`);
      setIsPlaying(!state.paused);
      setPosition(state.position);
      setDuration(state.duration);
      // Only rebuild currentTrack when the track actually changes. player_state_
      // changed fires several times a second during playback; recreating the
      // object each time re-rendered every consumer (and flickered the queue).
      if (currentTrackRef.current?.uri !== sdkTrack.uri) {
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
      }

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
      plog('sdk:account_error', message?.slice(0, 80));
      console.error('Spotify account error (Premium required):', message);
      setPlayerError('Spotify Premium is required for playback.');
    });
    player.addListener('initialization_error', ({ message }: { message: string }) => {
      plog('sdk:init_error', message?.slice(0, 80));
      console.error('Spotify init error:', message);
      setPlayerError("This browser can't initialize the player.");
    });
    player.addListener('authentication_error', ({ message }: { message: string }) => {
      plog('sdk:auth_error', message?.slice(0, 80));
      console.error('Spotify auth error:', message);
      // Let the next init re-create the player with a fresh token.
      initialized.current = false;
      setPlayerError('reconnect');
    });

    const connected = await player.connect();
    plog('initPlayer', `connect() -> ${connected}`);
    playerRef.current = player;
  }, []);

  // Re-download and re-run the Spotify SDK script from scratch. A new
  // Spotify.Player built from the already-loaded SDK reuses the SDK's global
  // connection state, which stays wedged after a long background — so a plain
  // rebuild won't recover, but a page refresh will. Re-injecting the script
  // re-initialises that global state: a reload without reloading.
  const reloadSdkScript = useCallback(() => {
    return new Promise<void>((resolve) => {
      plog('reloadSdk', 'removing script + window.Spotify, re-injecting');
      document.getElementById('spotify-player-sdk')?.remove();
      // Drop the stale global so the re-injected script fully re-initialises
      // (and so any double-load guard inside the SDK doesn't short-circuit).
      try {
        delete (window as unknown as { Spotify?: unknown }).Spotify;
      } catch {
        (window as unknown as { Spotify?: unknown }).Spotify = undefined;
      }
      let done = false;
      const start = Date.now();
      const finish = () => {
        if (done) return;
        done = true;
        plog('reloadSdk', `SDK ready (${Date.now() - start}ms)`);
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
      plog('recreate', 'already in flight, waiting');
      const s = Date.now();
      while (recreatingRef.current && Date.now() - s < 14000) {
        await new Promise((r) => setTimeout(r, 150));
      }
      return;
    }
    recreatingRef.current = true;
    plog('recreate', 'START (full SDK reload + rebuild)');
    try {
      // Detach the OLD player's listeners before discarding it. disconnect()
      // alone doesn't stop them — across an SDK-script reload the old listeners
      // survive in the SDK's emitter and keep firing alongside the new player's,
      // which is why every ready/state event was logging twice. removeListener
      // clears them so only the fresh player reports.
      const old = playerRef.current as unknown as {
        removeListener?: (e: string) => void;
        disconnect?: () => void;
      } | null;
      if (old) {
        try {
          ['ready', 'not_ready', 'player_state_changed', 'account_error', 'initialization_error', 'authentication_error'].forEach(
            (ev) => old.removeListener?.(ev)
          );
          old.disconnect?.();
        } catch {
          /* ignore */
        }
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
      plog('recreate', deviceIdRef.current ? `END device=${String(deviceIdRef.current).slice(0, 6)} (${Date.now() - start}ms)` : 'END NO DEVICE (timeout 10s)');
      // Force the NEXT play gesture to re-activate audio on this fresh player.
      // Crucially, do NOT activate here: a rebuild often runs off-gesture (the
      // proactive foreground resync, the watchdog), where activateElement won't
      // truly unlock audio on mobile but WOULD mark us "activated" — causing the
      // real user tap to skip activation and play silently. Let the tap's
      // ensureActivated() unlock it inside a genuine gesture.
      activatedRef.current = false;
    } finally {
      recreatingRef.current = false;
    }
  }, [initPlayer, reloadSdkScript]);

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
      plog('hidden', 'backgrounded; activation latch reset');
    };

    const resync = async () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        markHidden();
        return;
      }
      const p = playerRef.current;
      if (!p) {
        plog('resync', 'foreground but NO player');
        return;
      }
      const hiddenMs = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = 0;

      let state = await p.getCurrentState();
      const awayLimit = window.innerWidth < 640 ? 45 * 1000 : 5 * 60 * 1000;
      plog('resync', `foreground hiddenMs=${hiddenMs} away=${awayLimit} state=${state ? `paused=${state.paused}` : 'null'}`);
      if (!reconnectingRef.current && !recreatingRef.current) {
        if (hiddenMs > awayLimit && recreatePlayerRef.current) {
          plog('resync', 'long idle -> proactive recreate');
          // After a long idle the web device is almost always stale — and a
          // PAUSED device returns a zombie state object, so getCurrentState can't
          // tell us it's dead (this is why pausing-then-backgrounding wedged the
          // next play for ~5s). Don't trust the state: rebuild proactively NOW
          // (full SDK reload) while the user is orienting to the screen, so the
          // next play tap hits a fresh, ready device instead of paying the
          // multi-second recovery itself.
          await recreatePlayerRef.current();
          state = (await playerRef.current?.getCurrentState()) ?? null;
        } else if (!state) {
          plog('resync', 'short idle, no state -> reconnect');
          // Short idle but no live state (audio moved to another device) — a
          // cheap, non-destructive reconnect is enough and keeps deviceId visible.
          await reconnectDevice();
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
      showTrackOptimistically(track);
      playUri(track.uri);
      // Auto-open the side lyrics panel when a song starts (desktop only — on
      // mobile the side panel would cover the screen; lyrics live in Now Playing).
      // Don't steal the slot if the user has the Queue panel open.
      if (typeof window !== 'undefined' && window.innerWidth >= 640 && !showQueueRef.current) {
        setShowLyrics(true);
      }
    },
    [playUri, ensureActivated, showTrackOptimistically]
  );

  const upcoming = useCallback(() => {
    const q = queueRef.current;
    const i = indexRef.current;
    const ctx = q.length === 0 || i < 0 ? [] : q.slice(i + 1, i + 1 + 30);
    // "Play next" queue jumps the line ahead of the context sequence.
    return [...userQueueRef.current, ...ctx].slice(0, 30);
  }, []);

  // Play/pause with full mobile recovery. Shared by the UI controls AND the OS
  // Media Session (lock screen / Control Center) handlers.
  const togglePlay = useCallback(
    async (v: boolean) => {
      // Coalesce rapid taps. A post-idle play can take seconds to recover; without
      // this guard every impatient tap during that window started ANOTHER toggle
      // and flipped the intended state, so they all resolved into a
      // play→pause→play flicker. Ignore taps until the in-flight one settles.
      if (toggleBusyRef.current) {
        plog('toggle', `v=${v} IGNORED (busy)`);
        return;
      }
      toggleBusyRef.current = true;
      plog('toggle', `v=${v} dev=${deviceIdRef.current ? deviceIdRef.current.slice(0, 6) : 'none'} activated=${activatedRef.current}`);
      // Reflect the intent on the button immediately so the tap visibly registers
      // (and the user isn't tempted to keep mashing during recovery).
      setIsPlaying(v);
      try {
        if (v) {
          ensureActivated();
          const state = await playerRef.current?.getCurrentState();
          // Capture the paused position BEFORE any recovery clears it.
          const resumeAt = lastPosRef.current;
          plog('toggle', `getCurrentState -> ${state ? `paused=${state.paused} pos=${state.position}` : 'null'}`);
          if (state && !state.paused) {
            // Already actually playing on this device — nothing to do.
            plog('toggle', 'already playing');
          } else if (state) {
            // Live device with the track still loaded (short background) — a plain
            // resume works and keeps the exact position.
            plog('toggle', 'resume() on live device');
            await playerRef.current?.resume();
          } else {
            // No live state: the web device was dropped while backgrounded. Do NOT
            // bodyless-"resume" — after a long idle Spotify has discarded the paused
            // session, so resume hits a dead/empty context. Re-play the current
            // track at its last position through playUri, which carries the full
            // device-recovery ladder (reconnect → rebuild) and actually starts audio.
            const track = currentTrackRef.current;
            plog('toggle', `no state -> replay via playUri (track=${!!track})`);
            if (track) {
              await playUri(track.uri, resumeAt);
            } else {
              setIsPlaying(false);
            }
          }
        } else {
          plog('toggle', 'pause()');
          await playerRef.current?.pause();
        }
      } finally {
        toggleBusyRef.current = false;
      }
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
    userQueue,
    shuffle,
    showLyrics,
    showQueue,
    showEqualizer,
    showNowPlaying,
    retryPlayer,
    setIsPlaying: togglePlay,
    setPosition: seekTo,
    setVolume: async (v) => {
      await playerRef.current?.setVolume(v);
      setVolume(v);
    },
    // Lyrics and Queue share the right-side panel slot, so opening one closes the other.
    toggleLyrics: () => {
      setShowQueue(false);
      setShowLyrics((p) => !p);
    },
    toggleQueue: () => {
      setShowLyrics(false);
      setShowQueue((p) => !p);
    },
    toggleEqualizer: () => setShowEqualizer((p) => !p),
    toggleNowPlaying: () => setShowNowPlaying((p) => !p),
    setShowNowPlaying: (v) => setShowNowPlaying(v),
    toggleShuffle: () => setShuffle((p) => !p),
    playTrack,
    queueTrack,
    removeFromQueue,
    reorderQueue,
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
