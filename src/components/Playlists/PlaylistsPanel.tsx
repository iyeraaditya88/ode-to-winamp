'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, m } from 'framer-motion';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useSearchPlaylists } from '@/hooks/useSearchPlaylists';
import { usePlaylistMutations } from '@/hooks/usePlaylistMutations';
import PlaylistDetail from './PlaylistDetail';
import type { SpotifyPlaylist, SpotifyTrack } from '@/types/spotify';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenInSphere: (playlist: SpotifyPlaylist, tracks: SpotifyTrack[]) => void;
}

function PlaylistRow({ p, onClick }: { p: SpotifyPlaylist; onClick: () => void }) {
  const cover = p.images?.[0]?.url;
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-2 rounded-sm hover:bg-white/5 text-left transition-colors">
      <div className="relative h-12 w-12 shrink-0 rounded-sm overflow-hidden bg-white/10">
        {cover && <Image src={cover} alt="" fill sizes="48px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white/85">{p.name}</p>
        <p className="truncate text-xs text-white/45">
          {p.owner?.display_name ?? 'Spotify'}
          {p.tracks ? ` · ${p.tracks.total} tracks` : ''}
        </p>
      </div>
    </button>
  );
}

export default function PlaylistsPanel({ isOpen, onClose, onOpenInSphere }: Props) {
  const [tab, setTab] = useState<'mine' | 'search'>('mine');
  const [selected, setSelected] = useState<SpotifyPlaylist | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } = usePlaylists(isOpen);
  const readNeedsReconnect = isError && (error as Error)?.message === 'reconnect';
  const search = useSearchPlaylists();
  const { create, pending, needsReconnect } = usePlaylistMutations();

  const mine = data?.pages.flatMap((p) => p.items) ?? [];

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selected) setSelected(null);
      else handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selected]);

  const doCreate = async () => {
    if (!newName.trim()) return;
    await create(newName.trim());
    setNewName('');
    setCreating(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-40 bg-[#080808]/97 backdrop-blur-md flex flex-col"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          {selected ? (
            <PlaylistDetail
              playlist={selected}
              onBack={() => setSelected(null)}
              onOpenInSphere={(pl, tracks) => {
                onOpenInSphere(pl, tracks);
                handleClose();
              }}
            />
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTab('mine')}
                    className={`text-xs font-mono tracking-[0.2em] uppercase px-3 py-1.5 rounded-sm transition-colors ${tab === 'mine' ? 'bg-[#00b4b4]/15 text-[#00b4b4]' : 'text-white/45 hover:text-white/70'}`}
                  >
                    My Playlists
                  </button>
                  <button
                    onClick={() => setTab('search')}
                    className={`text-xs font-mono tracking-[0.2em] uppercase px-3 py-1.5 rounded-sm transition-colors ${tab === 'search' ? 'bg-[#00b4b4]/15 text-[#00b4b4]' : 'text-white/45 hover:text-white/70'}`}
                  >
                    Search public
                  </button>
                </div>
                <button onClick={handleClose} className="text-white/55 hover:text-white text-xs font-mono tracking-widest">
                  ESC
                </button>
              </div>

              {(needsReconnect || readNeedsReconnect) && (
                <a href="/api/auth/login" className="block mx-4 mt-3 text-center text-xs text-[#00b4b4] hover:underline font-mono">
                  Reconnect Spotify to enable playlists →
                </a>
              )}

              {tab === 'mine' ? (
                <div className="flex-1 overflow-y-auto px-2 sm:px-6 py-3 space-y-1">
                  {/* Create */}
                  {creating ? (
                    <div className="flex items-center gap-2 p-2">
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && doCreate()}
                        placeholder="New playlist name…"
                        className="flex-1 bg-white/5 rounded-sm px-3 py-2 text-sm text-white outline-none border border-white/10 focus:border-[#00b4b4]/50"
                      />
                      <button onClick={doCreate} disabled={pending || !newName.trim()} className="text-xs font-mono text-[#00b4b4] disabled:opacity-40 px-2">
                        Create
                      </button>
                      <button onClick={() => setCreating(false)} className="text-xs font-mono text-white/40 px-1">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setCreating(true)} className="w-full flex items-center gap-3 p-2 rounded-sm hover:bg-white/5 text-left">
                      <span className="h-12 w-12 shrink-0 rounded-sm bg-white/10 flex items-center justify-center text-white/70 text-xl">+</span>
                      <span className="text-sm text-white/85">New playlist</span>
                    </button>
                  )}

                  {isLoading && <p className="text-sm text-white/40 font-mono px-2 py-4">Loading your playlists…</p>}
                  {mine.map((p) => (
                    <PlaylistRow key={p.id} p={p} onClick={() => setSelected(p)} />
                  ))}
                  {hasNextPage && (
                    <button
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="w-full text-center text-xs text-white/40 hover:text-white/70 font-mono py-3"
                    >
                      {isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-2 sm:px-6 py-3">
                  <input
                    autoFocus
                    value={search.query}
                    onChange={(e) => search.setQuery(e.target.value)}
                    placeholder="Search public playlists…"
                    className="w-full bg-white/5 rounded-sm px-3 py-2.5 text-sm text-white outline-none border border-white/10 focus:border-[#00b4b4]/50 mb-3"
                  />
                  {search.isLoading && <p className="text-sm text-white/40 font-mono px-2 py-2">Searching…</p>}
                  <div className="space-y-1">
                    {search.results.map((p) => (
                      <PlaylistRow key={p.id} p={p} onClick={() => setSelected(p)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
