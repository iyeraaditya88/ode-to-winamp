import type { SpotifyTrack } from '@/types/spotify';

/** Public Spotify web link for a track. */
export function trackUrl(track: SpotifyTrack): string {
  return `https://open.spotify.com/track/${track.id}`;
}

export type ShareResult = 'shared' | 'copied' | 'failed';

/**
 * Share a track: native share sheet where available (mobile → any messenger),
 * otherwise copy the link to the clipboard.
 */
export async function shareTrack(track: SpotifyTrack): Promise<ShareResult> {
  const url = trackUrl(track);
  const artists = track.artists.map((a) => a.name).join(', ');
  const text = `${track.name} — ${artists}`;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: track.name, text, url });
      return 'shared';
    } catch (err) {
      // User cancelled the share sheet — not an error.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
      // Fall through to clipboard on any other failure.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
