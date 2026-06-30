'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { usePlayer } from '@/contexts/PlayerContext';
import type { SpotifyTrack } from '@/types/spotify';

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function artUrl(track: SpotifyTrack) {
  return track.album.images.slice(-1)[0]?.url ?? track.album.images[0]?.url;
}

export default function QueuePanel({ isOpen, onClose }: QueuePanelProps) {
  const { currentTrack, userQueue, removeFromQueue, reorderQueue, upcoming } = usePlayer();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // upcoming() = [...userQueue, ...gridNext]; show the grid part as read-only.
  const gridNext = upcoming().slice(userQueue.length);

  const TrackRow = ({ track, sub }: { track: SpotifyTrack; sub?: string }) => {
    const art = artUrl(track);
    return (
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative h-9 w-9 shrink-0 rounded-sm overflow-hidden bg-white/10">
          {art && <Image src={art} alt="" fill sizes="36px" draggable={false} className="object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] text-white/85">{track.name}</p>
          <p className="truncate text-[11px] text-white/45">
            {sub ?? track.artists.map((a) => a.name).join(', ')}
          </p>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed right-0 top-0 bottom-20 z-40 w-80 max-w-[88vw] border-l border-white/5 bg-[#0d0d0d]/95 backdrop-blur-md flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <span className="text-xs font-mono tracking-widest text-white/62 uppercase">Queue</span>
            <button onClick={onClose} className="text-white/55 hover:text-white/85 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {/* Now playing */}
            {currentTrack && (
              <div>
                <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-[#00b4b4]/70">Now playing</p>
                <TrackRow track={currentTrack} />
              </div>
            )}

            {/* Editable user queue */}
            <div>
              <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-white/40">
                Next in queue{userQueue.length ? ` · ${userQueue.length}` : ''}
              </p>
              {userQueue.length === 0 ? (
                <p className="text-[12px] text-white/35 leading-relaxed">
                  Nothing queued. Right-click a song in the grid → <span className="text-white/55">Add to queue</span>.
                </p>
              ) : (
                <div className="space-y-1">
                  {userQueue.map((track, i) => (
                    <div
                      key={`${track.id}-${i}`}
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (overIndex !== i) setOverIndex(i);
                      }}
                      onDrop={() => {
                        if (dragIndex !== null) reorderQueue(dragIndex, i);
                        setDragIndex(null);
                        setOverIndex(null);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setOverIndex(null);
                      }}
                      className={`group flex items-center gap-2 rounded-sm px-1 py-1 transition-colors ${
                        overIndex === i && dragIndex !== i ? 'bg-[#00b4b4]/10' : 'hover:bg-white/5'
                      } ${dragIndex === i ? 'opacity-40' : ''}`}
                    >
                      {/* drag handle */}
                      <span className="shrink-0 cursor-grab active:cursor-grabbing text-white/25 group-hover:text-white/50">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="9" cy="6" r="1.6" />
                          <circle cx="15" cy="6" r="1.6" />
                          <circle cx="9" cy="12" r="1.6" />
                          <circle cx="15" cy="12" r="1.6" />
                          <circle cx="9" cy="18" r="1.6" />
                          <circle cx="15" cy="18" r="1.6" />
                        </svg>
                      </span>
                      <div className="flex-1 min-w-0">
                        <TrackRow track={track} />
                      </div>
                      {/* remove */}
                      <button
                        onClick={() => removeFromQueue(i)}
                        title="Remove from queue"
                        className="shrink-0 text-white/30 hover:text-red-300 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14">
                          <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Read-only continuation from the grid */}
            {gridNext.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-white/40">Up next</p>
                <div className="space-y-2 opacity-70">
                  {gridNext.map((track, i) => (
                    <TrackRow key={`${track.id}-up-${i}`} track={track} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
