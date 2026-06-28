'use client';

import { useEffect } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { useMusicTaste } from '@/hooks/useMusicTaste';
import GenreRadar from './GenreRadar';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function MusicTastePanel({ isOpen, onClose }: Props) {
  const { profile, phase, progress, analyzed, total, notConfigured } = useMusicTaste(isOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const loading = !notConfigured && !profile;
  const maxPct = profile ? Math.max(1, ...profile.ranked.map((s) => s.pct)) : 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] bg-[#080808]/97 backdrop-blur-md flex flex-col"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-white/5 shrink-0">
            <span className="text-xs font-mono tracking-[0.3em] text-white/62 uppercase">Music Taste</span>
            <button onClick={onClose} className="text-white/55 hover:text-white text-xs font-mono tracking-widest">
              ESC
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
            {/* Not configured */}
            {notConfigured && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4 max-w-md mx-auto">
                <div className="h-12 w-12 rounded-full border border-[#00b4b4]/40 flex items-center justify-center text-[#00b4b4]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-sm text-white/80">Music Taste needs a free Last.fm API key.</p>
                <p className="text-xs text-white/45 font-mono leading-relaxed">
                  Get one at{' '}
                  <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer" className="text-[#00b4b4] hover:underline">
                    last.fm/api
                  </a>{' '}
                  and set <span className="text-white/70">LASTFM_API_KEY</span> in the environment.
                </p>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="h-full flex flex-col items-center justify-center gap-5">
                <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-[#00b4b4] animate-spin" />
                <p className="text-xs text-[#00b4b4]/80 font-mono tracking-[0.2em] uppercase">
                  {phase === 'genres' ? `Mapping your genres · ${Math.round(progress * 100)}%` : 'Reading your library'}
                </p>
                {phase === 'genres' && (
                  <div className="h-1 w-48 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-[#00b4b4] transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
                  </div>
                )}
              </div>
            )}

            {/* Result */}
            {profile && (
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-6">
                  <p className="text-[10px] font-mono tracking-[0.3em] text-white/40 uppercase mb-2">Your taste reads as</p>
                  <h2 className="text-2xl sm:text-3xl font-semibold text-white">{profile.archetype}</h2>
                  <p className="text-xs text-white/45 font-mono mt-2">
                    Across your top {analyzed} artists · {total} liked songs
                  </p>
                </div>

                <div className="grid lg:grid-cols-2 gap-8 items-center">
                  {/* Radar */}
                  <div className="py-2">
                    <GenreRadar slices={profile.slices} />
                  </div>

                  {/* Ranked breakdown + notable */}
                  <div className="flex flex-col gap-5">
                    <div className="space-y-2.5">
                      {profile.ranked.slice(0, 8).map((s) => (
                        <div key={s.id} className="flex items-center gap-3">
                          <span className="w-20 sm:w-24 shrink-0 text-xs text-white/70 font-mono truncate">{s.label}</span>
                          <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                            <m.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(s.pct / maxPct) * 100}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                              className="h-full rounded-full bg-gradient-to-r from-[#00b4b4] to-[#00f0f0]"
                            />
                          </div>
                          <span className="w-8 shrink-0 text-right text-[10px] text-white/50 font-mono tabular-nums">{s.pct}%</span>
                        </div>
                      ))}
                    </div>

                    {profile.notable.length > 0 && (
                      <div>
                        <p className="text-[10px] font-mono tracking-[0.3em] text-white/40 uppercase mb-2">Notable sub-genres</p>
                        <div className="flex flex-wrap gap-2">
                          {profile.notable.map((t) => (
                            <span key={t} className="px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] text-[11px] text-white/65">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
