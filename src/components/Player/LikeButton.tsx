'use client';

import { useTrackLike } from '@/hooks/useTrackLike';
import type { SpotifyTrack } from '@/types/spotify';

interface LikeButtonProps {
  track: SpotifyTrack | null;
  /** Show a LIKE/LIKED text label (Now Playing header); icon-only otherwise. */
  showLabel?: boolean;
  size?: number;
  className?: string;
}

/** Heart toggle that reflects + flips a track's Liked-Songs state. */
export default function LikeButton({ track, showLabel = false, size = 16, className = '' }: LikeButtonProps) {
  const { liked, toggle, pending, needsReconnect } = useTrackLike(track);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (needsReconnect) window.location.href = '/api/auth/login';
        else toggle();
      }}
      disabled={!track || pending}
      title={
        needsReconnect
          ? 'Reconnect Spotify to like songs'
          : liked
          ? 'Remove from Liked Songs'
          : 'Add to Liked Songs'
      }
      aria-pressed={liked}
      className={`flex items-center gap-2 transition-colors disabled:opacity-30 ${
        liked ? 'text-[#00b4b4]' : 'text-white/55 hover:text-white/85'
      } ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        className="transition-transform active:scale-90"
      >
        <path
          d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showLabel && (
        <span className="hidden sm:inline text-xs font-mono tracking-widest">{liked ? 'LIKED' : 'LIKE'}</span>
      )}
    </button>
  );
}
