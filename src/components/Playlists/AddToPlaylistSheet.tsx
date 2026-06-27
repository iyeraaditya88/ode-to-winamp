'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, m } from 'framer-motion';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useMe } from '@/hooks/useMe';
import { usePlaylistMutations } from '@/hooks/usePlaylistMutations';
import type { SpotifyTrack } from '@/types/spotify';

interface Props {
  track: SpotifyTrack | null;
  onClose: () => void;
}

/** Compact picker: add a track to one of the user's playlists (or a new one). */
export default function AddToPlaylistSheet({ track, onClose }: Props) {
  const { data } = usePlaylists(!!track);
  const { data: me } = useMe();
  const { create, addTrack, pending, needsReconnect } = usePlaylistMutations();
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const playlists = (data?.pages.flatMap((p) => p.items) ?? []).filter(
    (p) => p.owner?.id === me?.id || p.collaborative
  );

  const addTo = async (playlistId: string) => {
    if (!track) return;
    const ok = await addTrack(playlistId, track.uri);
    if (ok) setAdded((s) => ({ ...s, [playlistId]: true }));
  };

  const createAndAdd = async () => {
    if (!newName.trim() || !track) return;
    const pl = await create(newName.trim());
    if (pl) {
      await addTrack(pl.id, track.uri);
      setAdded((s) => ({ ...s, [pl.id]: true }));
      setNewName('');
      setCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {track && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <m.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="w-full sm:max-w-md max-h-[70vh] flex flex-col bg-[#101010] border border-white/10 rounded-t-xl sm:rounded-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <span className="text-xs font-mono tracking-[0.2em] text-white/62 uppercase">Add to playlist</span>
              <button onClick={onClose} className="text-white/55 hover:text-white text-xs font-mono">
                ✕
              </button>
            </div>

            <p className="px-4 pt-2 text-xs text-white/45 truncate">
              {track.name} — {track.artists.map((a) => a.name).join(', ')}
            </p>

            {needsReconnect && (
              <a
                href="/api/auth/login"
                className="mx-4 mt-2 block text-center text-xs text-[#00b4b4] hover:underline font-mono"
              >
                Reconnect Spotify to manage playlists →
              </a>
            )}

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {/* New playlist */}
              {creating ? (
                <div className="flex items-center gap-2 p-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
                    placeholder="New playlist name…"
                    className="flex-1 bg-white/5 rounded-sm px-2 py-1.5 text-sm text-white outline-none border border-white/10 focus:border-[#00b4b4]/50"
                  />
                  <button
                    onClick={createAndAdd}
                    disabled={pending || !newName.trim()}
                    className="text-xs font-mono text-[#00b4b4] disabled:opacity-40 px-2"
                  >
                    Create
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-3 p-2 rounded-sm hover:bg-white/5 text-left"
                >
                  <span className="h-10 w-10 shrink-0 rounded-sm bg-white/10 flex items-center justify-center text-white/70 text-lg">
                    +
                  </span>
                  <span className="text-sm text-white/85">New playlist</span>
                </button>
              )}

              {playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addTo(p.id)}
                  disabled={pending || added[p.id]}
                  className="w-full flex items-center gap-3 p-2 rounded-sm hover:bg-white/5 text-left disabled:opacity-70"
                >
                  <div className="relative h-10 w-10 shrink-0 rounded-sm overflow-hidden bg-white/10">
                    {p.images?.[0]?.url && <Image src={p.images[0].url} alt="" fill sizes="40px" className="object-cover" />}
                  </div>
                  <span className="flex-1 min-w-0 truncate text-sm text-white/85">{p.name}</span>
                  <span className={`text-xs font-mono ${added[p.id] ? 'text-[#00b4b4]' : 'text-white/30'}`}>
                    {added[p.id] ? '✓ Added' : 'Add'}
                  </span>
                </button>
              ))}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
