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
  showLyrics: boolean;
  showEqualizer: boolean;
}

interface PlayerActions {
  setDeviceId: (id: string) => void;
  setIsPlaying: (v: boolean) => void;
  setPosition: (ms: number) => void;
  setDuration: (ms: number) => void;
  setCurrentTrack: (track: SpotifyTrack | null) => void;
  setQueue: (tracks: SpotifyTrack[]) => void;
  setVolume: (v: number) => void;
  toggleLyrics: () => void;
  toggleEqualizer: () => void;
  playTrack: (track: SpotifyTrack, context?: SpotifyTrack[]) => void;
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
  const [showLyrics, setShowLyrics] = useState(false);
  const [showEqualizer, setShowEqualizer] = useState(false);

  const playerRef = useRef<Spotify.Player | null>(null);
  const initialized = useRef(false);

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

    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
    }

    return () => {
      playerRef.current?.disconnect();
    };
  }, [initPlayer]);

  useEffect(() => {
    if (!isPlaying || !playerRef.current) return;
    const interval = setInterval(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (state) setPosition(state.position);
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const playTrack = useCallback(
    async (track: SpotifyTrack, context?: SpotifyTrack[]) => {
      if (context) setQueue(context);
      if (!deviceId) return;
      await fetch(`/api/spotify/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [track.uri] }),
      });
    },
    [deviceId]
  );

  const value: PlayerState & PlayerActions = {
    currentTrack,
    isPlaying,
    position,
    duration,
    volume,
    deviceId,
    queue,
    showLyrics,
    showEqualizer,
    setDeviceId,
    setIsPlaying: async (v) => {
      if (v) await playerRef.current?.resume();
      else await playerRef.current?.pause();
      setIsPlaying(v);
    },
    setPosition: async (ms) => {
      await playerRef.current?.seek(ms);
      setPosition(ms);
    },
    setDuration,
    setCurrentTrack,
    setQueue,
    setVolume: async (v) => {
      await playerRef.current?.setVolume(v);
      setVolume(v);
    },
    toggleLyrics: () => setShowLyrics((p) => !p),
    toggleEqualizer: () => setShowEqualizer((p) => !p),
    playTrack,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be inside PlayerProvider');
  return ctx;
}
