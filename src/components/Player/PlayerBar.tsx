'use client';

import Image from 'next/image';
import { usePlayer } from '@/contexts/PlayerContext';
import ProgressBar from './ProgressBar';
import VolumeControl from './VolumeControl';
import Equalizer from '@/components/Equalizer/Equalizer';
import LyricsPanel from '@/components/Lyrics/LyricsPanel';

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    volume,
    showLyrics,
    showEqualizer,
    setIsPlaying,
    setPosition,
    setVolume,
    toggleLyrics,
    toggleEqualizer,
  } = usePlayer();

  const art = currentTrack?.album.images.slice(-1)[0]?.url;

  const handlePrevNext = async (dir: 'prev' | 'next') => {
    // Use keyboard approach via player — the player is in context ref
    // We call the Spotify skip endpoints
    const token = await fetch('/api/auth/token').then(r => r.json()).catch(() => null);
    if (!token?.token) return;
    await fetch(`https://api.spotify.com/v1/me/player/${dir === 'next' ? 'next' : 'previous'}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}` },
    });
  };

  return (
    <>
      <LyricsPanel
        isOpen={showLyrics}
        onClose={toggleLyrics}
        track={currentTrack}
        positionMs={position}
      />

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/5 bg-[#111111]/95 backdrop-blur-md">
        <div className="mx-auto max-w-screen-2xl px-4 py-3">
          <div className="grid grid-cols-3 items-center gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-sm bg-white/5">
                {art && (
                  <Image src={art} alt="" fill sizes="40px" className="object-cover" />
                )}
              </div>
              {currentTrack ? (
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-white/90">{currentTrack.name}</p>
                  <p className="truncate text-[10px] text-white/40">
                    {currentTrack.artists.map((a) => a.name).join(', ')}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-white/20 font-mono">Nothing playing</p>
              )}
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-5">
                <button
                  onClick={() => handlePrevNext('prev')}
                  disabled={!currentTrack}
                  className="text-white/40 hover:text-white/80 transition-colors disabled:opacity-20"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                  </svg>
                </button>

                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={!currentTrack}
                  className={`h-9 w-9 rounded-full border flex items-center justify-center transition-all ${
                    currentTrack
                      ? 'border-white/40 hover:border-white hover:bg-white hover:text-black text-white'
                      : 'border-white/10 text-white/20'
                  }`}
                >
                  {isPlaying ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 1 }}>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => handlePrevNext('next')}
                  disabled={!currentTrack}
                  className="text-white/40 hover:text-white/80 transition-colors disabled:opacity-20"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                  </svg>
                </button>
              </div>

              <ProgressBar position={position} duration={duration} onSeek={setPosition} />
            </div>

            <div className="flex items-center justify-end gap-3">
              {showEqualizer && (
                <Equalizer isPlaying={isPlaying} className="h-6 w-16" />
              )}

              <button
                onClick={toggleEqualizer}
                title="Equalizer"
                className={`transition-colors text-xs font-mono tracking-widest px-2 py-1 rounded-sm border ${
                  showEqualizer
                    ? 'border-[#00b4b4]/50 text-[#00b4b4]'
                    : 'border-white/10 text-white/30 hover:text-white/60'
                }`}
              >
                EQ
              </button>

              <button
                onClick={toggleLyrics}
                title="Lyrics"
                className={`transition-colors ${
                  showLyrics ? 'text-[#00b4b4]' : 'text-white/30 hover:text-white/60'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
              </button>

              <VolumeControl volume={volume} onVolumeChange={setVolume} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
