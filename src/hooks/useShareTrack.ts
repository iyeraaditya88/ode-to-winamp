'use client';

import { useCallback, useRef, useState } from 'react';
import { shareTrack } from '@/lib/share';
import type { SpotifyTrack } from '@/types/spotify';

/**
 * Share a track and expose a transient `copied` flag so a button can show
 * "Copied" feedback on desktop (where the link is copied rather than shared).
 */
export function useShareTrack() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const share = useCallback(async (track: SpotifyTrack | null) => {
    if (!track) return;
    const result = await shareTrack(track);
    if (result === 'copied') {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    }
  }, []);

  return { share, copied };
}
