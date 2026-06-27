'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { usePlaylistTracks } from '@/hooks/usePlaylistTracks';
import { useMe } from '@/hooks/useMe';
import { usePlaylistMutations } from '@/hooks/usePlaylistMutations';
import { usePlayer } from '@/contexts/PlayerContext';
import type { SpotifyPlaylist, SpotifyTrack } from '@/types/spotify';

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  playlist: SpotifyPlaylist;
  onBack: () => void;
  onOpenInSphere: (playlist: SpotifyPlaylist, tracks: SpotifyTrack[]) => void;
}

export default function PlaylistDetail({ playlist, onBack, onOpenInSphere }: Props) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = usePlaylistTracks(playlist.id);
  const { data: me } = useMe();
  const { removeTrack } = usePlaylistMutations();
  const { playTrack, currentTrack } = usePlayer();
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const owned = playlist.owner.id === me?.id || playlist.collaborative;

  // Pull a generous chunk so "open in sphere" and the queue have the tracks.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && (data?.pages.flatMap((p) => p.items).length ?? 0) < 200) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, data, fetchNextPage]);

  const tracks = useMemo<SpotifyTrack[]>(
    () =>
      (data?.pages.flatMap((p) => p.items) ?? [])
        .map((i) => i.track)
        .filter((t): t is SpotifyTrack => !!t && !removed.has(t.uri)),
    [data, removed]
  );

  const cover = playlist.images?.[0]?.url;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <div className="flex items-start gap-4 px-4 sm:px-8 py-4 border-b border-white/5">
        <button onClick={onBack} className="text-white/55 hover:text-white text-sm font-mono mt-1">
          ←
        </button>
        <div className="relative h-16 w-16 shrink-0 rounded-sm overflow-hidden bg-white/10">
          {cover && <Image src={cover} alt="" fill sizes="64px" className="object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-white truncate">{playlist.name}</h2>
          <p className="text-xs text-white/50 truncate">
            {playlist.owner.display_name} · {playlist.tracks.total} tracks
          </p>
          <button
            onClick={() => onOpenInSphere(playlist, tracks)}
            disabled={tracks.length === 0}
            className="mt-2 px-3 py-1.5 rounded-sm border border-[#00b4b4]/40 text-[#00b4b4] hover:bg-[#00b4b4]/10 transition-colors text-xs font-mono tracking-widest disabled:opacity-40"
          >
            OPEN IN SPHERE
          </button>
        </div>
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto px-2 sm:px-6 py-2">
        {isLoading && <p className="text-sm text-white/40 font-mono px-2 py-4">Loading…</p>}
        {tracks.map((t, i) => {
          const active = t.id === currentTrack?.id;
          const art = t.album.images.slice(-1)[0]?.url;
          return (
            <div
              key={`${t.id}-${i}`}
              className={`group w-full flex items-center gap-3 p-2 rounded-sm transition-colors ${active ? 'bg-white/[0.07]' : 'hover:bg-white/5'}`}
            >
              <button onClick={() => playTrack(t, tracks)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <span className="text-[10px] text-white/30 font-mono w-5 text-right">{i + 1}</span>
                <div className="relative h-9 w-9 shrink-0 rounded-sm overflow-hidden bg-white/10">
                  {art && <Image src={art} alt="" fill sizes="36px" className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${active ? 'text-[#00b4b4]' : 'text-white/85'}`}>{t.name}</p>
                  <p className="truncate text-xs text-white/45">{t.artists.map((a) => a.name).join(', ')}</p>
                </div>
              </button>
              <span className="text-[10px] text-white/40 font-mono tabular-nums">{fmt(t.duration_ms)}</span>
              {owned && (
                <button
                  onClick={async () => {
                    if (await removeTrack(playlist.id, t.uri)) setRemoved((s) => new Set(s).add(t.uri));
                  }}
                  title="Remove from playlist"
                  className="text-white/25 hover:text-red-400 transition-colors px-1 opacity-0 group-hover:opacity-100"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
        {isFetchingNextPage && <p className="text-xs text-white/30 font-mono px-2 py-3">Loading more…</p>}
      </div>
    </div>
  );
}
