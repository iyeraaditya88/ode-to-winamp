'use client';

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import type { SpotifyTrack } from '@/types/spotify';

interface PlayerState {
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  deviceId: string | null;
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
  toggleShuffle: () => void;
  playTrack: (track: SpotifyTrack, context?: SpotifyTrack[]) => void;
  playNext: () => void;
  playPrev: () => void;
  upcoming: () => SpotifyTrack[];
}

const PlayerContext = createContext<(PlayerState & PlayerActions) | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [deviceId, setDeviceId] = useState<string | null>(null);
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
  const activatedRef = useRef(false);

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

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);

  const playUri = useCallback(async (uri: string) => {
    const id = deviceIdRef.current;
    if (!id) return;
    advancingRef.current = false;
    lastPosRef.current = 0;
    await fetch(`/api/spotify/play?device_id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [uri] }),
    });
  }, []);

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
    if (!token) return;

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
    });

    player.addListener('player_state_changed', (state: Spotify.PlaybackState | null) => {
      if (!state) return;
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
    });
    player.addListener('initialization_error', ({ message }: { message: string }) => {
      console.error('Spotify init error:', message);
    });
    player.addListener('authentication_error', ({ message }: { message: string }) => {
      console.error('Spotify auth error:', message);
    });

    await player.connect();
    playerRef.current = player;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Define the global callback BEFORE the SDK script loads, otherwise the
    // SDK throws "onSpotifyWebPlaybackSDKReady is not defined" on load.
    window.onSpotifyWebPlaybackSDKReady = () => {
      initPlayer();
    };

    if (window.Spotify) {
      initPlayer();
    } else if (!document.getElementById('spotify-player-sdk')) {
      const script = document.createElement('script');
      script.id = 'spotify-player-sdk';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
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

  const value: PlayerState & PlayerActions = {
    currentTrack,
    isPlaying,
    position,
    duration,
    volume,
    deviceId,
    queue,
    currentIndex,
    shuffle,
    showLyrics,
    showEqualizer,
    showNowPlaying,
    setIsPlaying: async (v) => {
      if (v) {
        ensureActivated();
        await playerRef.current?.resume();
      } else {
        await playerRef.current?.pause();
      }
      setIsPlaying(v);
    },
    setPosition: async (ms) => {
      await playerRef.current?.seek(ms);
      setPosition(ms);
    },
    setVolume: async (v) => {
      await playerRef.current?.setVolume(v);
      setVolume(v);
    },
    toggleLyrics: () => setShowLyrics((p) => !p),
    toggleEqualizer: () => setShowEqualizer((p) => !p),
    toggleNowPlaying: () => setShowNowPlaying((p) => !p),
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
