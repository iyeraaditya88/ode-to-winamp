'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import type { SpotifyTrack } from '@/types/spotify';

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const secs = s % 60;
  return `${m}:${String(secs).padStart(2, '0')}`;
}

interface SongCardProps {
  track: SpotifyTrack;
  isPlaying?: boolean;
  onPlay: (track: SpotifyTrack) => void;
  index: number;
}

const itemVariant = {
  hidden: { opacity: 0, y: 40 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export default function SongCard({ track, isPlaying, onPlay, index }: SongCardProps) {
  const art = track.album.images[0]?.url;
  const artistNames = track.artists.map((a) => a.name).join(', ');

  return (
    <motion.div
      variants={itemVariant}
      whileHover={{ scale: 1.02 }}
      className="group relative cursor-pointer overflow-hidden rounded-sm bg-[#111111] border border-white/5"
      onClick={() => onPlay(track)}
    >
      <div className="relative aspect-square w-full overflow-hidden">
        {art ? (
          <Image
            src={art}
            alt={track.album.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            priority={index < 8}
          />
        ) : (
          <div className="h-full w-full bg-[#222222] flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M6 22L10 10L14 18L18 6L22 18L26 10L30 22" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        <div className="absolute inset-0 bg-black/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-center justify-center">
          <div
            className={`h-14 w-14 rounded-full border-2 flex items-center justify-center transition-transform duration-200 group-hover:scale-100 scale-75 ${
              isPlaying ? 'border-[#00b4b4] bg-[#00b4b4]/20' : 'border-white bg-white/10'
            }`}
          >
            {isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="text-[#00b4b4]">
                <rect x="4" y="3" width="4" height="14" rx="1" />
                <rect x="12" y="3" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="white" style={{ marginLeft: 2 }}>
                <path d="M5 3.5L17 10L5 16.5V3.5Z" />
              </svg>
            )}
          </div>
        </div>

        {isPlaying && (
          <div className="absolute bottom-2 right-2 flex items-end gap-0.5 h-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-0.5 bg-[#00b4b4] rounded-full animate-eq-bar"
                style={{
                  height: '60%',
                  animation: `eqBar 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="truncate text-sm font-medium text-white/90 leading-tight">{track.name}</p>
        <p className="truncate text-xs text-white/62 mt-0.5">{artistNames}</p>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-white/50 font-mono">{formatDuration(track.duration_ms)}</p>
          {track.explicit && (
            <span className="text-[9px] text-white/50 border border-white/20 px-1 rounded uppercase tracking-wide">E</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
