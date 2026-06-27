'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { m, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/contexts/PlayerContext';
import { useRecognize } from '@/hooks/useRecognize';
import { useLikeTrack } from '@/hooks/useLikeTrack';

interface RecognizePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
}

export default function RecognizePanel({ isOpen, onClose, onSearch }: RecognizePanelProps) {
  const { playTrack } = usePlayer();
  const { state, result, error, listen, reset } = useRecognize();
  const { liked, pending, needsReconnect, like, reset: resetLike } = useLikeTrack();

  // Fresh start whenever the panel opens; tidy up on close.
  useEffect(() => {
    if (!isOpen) {
      reset();
      resetLike();
    }
  }, [isOpen, reset, resetLike]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const track = result?.track;
  const art = track?.album.images[0]?.url;

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] bg-[#080808]/95 backdrop-blur-md flex flex-col items-center justify-center px-6"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <button
            onClick={onClose}
            className="absolute top-5 right-6 text-white/55 hover:text-white transition-colors text-xs font-mono tracking-widest"
          >
            ESC
          </button>

          {/* ---- Idle: tap to listen ---- */}
          {(state === 'idle' || state === 'error' || state === 'nomatch') && (
            <div className="flex flex-col items-center text-center gap-6">
              <button
                onClick={listen}
                aria-label="Identify song"
                className="group relative h-28 w-28 rounded-full border border-[#00b4b4]/40 flex items-center justify-center hover:border-[#00b4b4] transition-colors"
              >
                <span className="absolute inset-0 rounded-full bg-[#00b4b4]/10 group-hover:bg-[#00b4b4]/20 transition-colors" />
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00d8d8" strokeWidth="1.6">
                  <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
                </svg>
              </button>
              <div>
                <p className="text-sm text-white/80 font-mono tracking-wide">
                  {state === 'nomatch'
                    ? "Couldn't catch that song"
                    : state === 'error'
                    ? error
                    : 'Identify the song playing'}
                </p>
                <p className="text-xs text-white/40 font-mono mt-2">
                  {state === 'idle' ? 'Tap the mic and hold near the speaker' : 'Tap to try again'}
                </p>
              </div>
            </div>
          )}

          {/* ---- Listening ---- */}
          {state === 'listening' && (
            <div className="flex flex-col items-center gap-7">
              <div className="relative h-40 w-40 flex items-center justify-center">
                {/* Expanding sonar rings */}
                {[0, 0.6, 1.2].map((delay) => (
                  <m.span
                    key={delay}
                    className="absolute rounded-full border border-[#00b4b4]/50"
                    initial={{ width: 80, height: 80, opacity: 0.6 }}
                    animate={{ width: 160, height: 160, opacity: 0 }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay }}
                  />
                ))}
                {/* Pulsing mic core */}
                <m.div
                  className="relative h-20 w-20 rounded-full bg-[#00b4b4]/25 border border-[#00b4b4]/60 flex items-center justify-center"
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ boxShadow: '0 0 30px rgba(0,180,180,0.4)' }}
                >
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#00e8e8" strokeWidth="1.6">
                    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
                  </svg>
                </m.div>
              </div>
              {/* Animated equalizer bars */}
              <div className="flex items-end gap-1 h-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <m.span
                    key={i}
                    className="w-1 rounded-full bg-[#00b4b4]"
                    animate={{ height: [6, 20, 6] }}
                    transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
                  />
                ))}
              </div>
              <p className="text-sm text-[#00b4b4] font-mono tracking-[0.3em]">LISTENING…</p>
            </div>
          )}

          {/* ---- Identifying ---- */}
          {state === 'identifying' && (
            <div className="flex flex-col items-center gap-5">
              <div className="h-10 w-10 rounded-full border-2 border-white/10 border-t-[#00b4b4] animate-spin" />
              <p className="text-sm text-white/70 font-mono tracking-widest">IDENTIFYING…</p>
            </div>
          )}

          {/* ---- Result ---- */}
          {state === 'result' && result && (
            <div className="flex flex-col items-center gap-5 w-full max-w-sm">
              <span className="text-[10px] text-[#00b4b4]/70 font-mono tracking-[0.3em] uppercase">Found it</span>
              <div className="relative h-44 w-44 rounded-lg overflow-hidden bg-white/5 shadow-2xl">
                {art && <Image src={art} alt="" fill className="object-contain" />}
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white">{result.title}</h2>
                <p className="text-sm text-white/55 mt-0.5">{result.artist}</p>
              </div>

              {track ? (
                <div className="flex flex-col items-center gap-3 w-full">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => playTrack(track)}
                      className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black text-sm font-medium hover:scale-105 transition-transform"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Play
                    </button>
                    <button
                      onClick={() => like(track.id)}
                      disabled={pending || liked}
                      className={`flex items-center gap-2 px-5 py-2 rounded-full border text-sm transition-colors ${
                        liked
                          ? 'border-[#00b4b4]/50 text-[#00b4b4]'
                          : 'border-white/20 text-white/80 hover:border-white/40'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {liked ? 'Liked' : pending ? 'Adding…' : 'Add to Liked'}
                    </button>
                  </div>
                  {needsReconnect && (
                    <a href="/api/auth/login" className="text-xs text-[#00b4b4] hover:underline font-mono">
                      Reconnect Spotify to enable liking →
                    </a>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => onSearch(`${result.title} ${result.artist}`)}
                  className="px-5 py-2 rounded-full border border-white/20 text-white/80 text-sm hover:border-white/40 transition-colors"
                >
                  Search in app
                </button>
              )}

              <button
                onClick={() => {
                  resetLike();
                  reset();
                }}
                className="text-xs text-white/40 hover:text-white/70 font-mono tracking-wide mt-1"
              >
                Identify another
              </button>
            </div>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
