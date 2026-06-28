'use client';

import { useEffect, useRef } from 'react';
import type { SpotifyTrack } from '@/types/spotify';

interface MediaState {
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  position: number;
  duration: number;
}

interface MediaActions {
  togglePlay: (v: boolean) => void;
  playNext: () => void;
  playPrev: () => void;
  seekTo: (ms: number) => void;
}

const hasMediaSession = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator;

/**
 * Wires the OS Media Session (lock screen / Control Center): transport buttons,
 * track metadata + artwork, play state and scrubber. On iOS this is also what
 * lets the system treat our audio as an active media session (background +
 * lock-screen resume). Kept out of PlayerContext so the playback engine stays
 * focused on device/SDK recovery.
 */
export function useMediaSession(
  { currentTrack, isPlaying, position, duration }: MediaState,
  actions: MediaActions
) {
  // Latest actions reachable from the once-registered handlers, without
  // re-registering them on every render.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Register transport handlers once.
  useEffect(() => {
    if (!hasMediaSession()) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: (d: MediaSessionActionDetails) => void) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* unsupported action — ignore */
      }
    };
    set('play', () => actionsRef.current.togglePlay(true));
    set('pause', () => actionsRef.current.togglePlay(false));
    set('previoustrack', () => actionsRef.current.playPrev());
    set('nexttrack', () => actionsRef.current.playNext());
    set('seekto', (d) => {
      if (d.seekTime != null) actionsRef.current.seekTo(d.seekTime * 1000);
    });
    return () => {
      (['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'] as MediaSessionAction[]).forEach((a) => {
        try {
          ms.setActionHandler(a, null);
        } catch {
          /* ignore */
        }
      });
    };
  }, []);

  // Lock-screen metadata follows the current track.
  useEffect(() => {
    if (!hasMediaSession()) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.name,
      artist: currentTrack.artists.map((a) => a.name).join(', '),
      album: currentTrack.album.name,
      artwork: currentTrack.album.images
        .filter((i) => i.url)
        .map((i) => ({
          src: i.url,
          sizes: i.width && i.height ? `${i.width}x${i.height}` : '512x512',
          type: 'image/jpeg',
        })),
    });
  }, [currentTrack]);

  // Reflect play/pause to the OS.
  useEffect(() => {
    if (!hasMediaSession()) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Reflect the scrubber position to the OS.
  useEffect(() => {
    if (!hasMediaSession()) return;
    const ms = navigator.mediaSession;
    if (typeof ms.setPositionState !== 'function' || duration <= 0) return;
    try {
      ms.setPositionState({
        duration: duration / 1000,
        position: Math.min(position, duration) / 1000,
        playbackRate: 1,
      });
    } catch {
      /* ignore out-of-range during track switches */
    }
  }, [position, duration]);
}
