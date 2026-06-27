export interface SpotifyImage {
  url: string;
  width: number;
  height: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  uri: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  images: SpotifyImage[];
  uri: string;
  release_date: string;
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  explicit: boolean;
  popularity: number;
  preview_url: string | null;
}

export interface LikedSongItem {
  added_at: string;
  track: SpotifyTrack;
}

export interface LikedSongsPage {
  items: LikedSongItem[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
  previous: string | null;
}

export interface SearchResults {
  tracks: {
    items: SpotifyTrack[];
    total: number;
    limit: number;
    offset: number;
    next: string | null;
  };
}

export interface SpotifyPlaylist {
  id: string;
  uri: string;
  name: string;
  description: string | null;
  images: SpotifyImage[];
  owner: { id: string; display_name: string };
  public: boolean | null;
  collaborative: boolean;
  // Spotify's /search?type=playlist returns tracks=null (only /me/playlists and
  // the full playlist object carry { total }). Keep it nullable.
  tracks: { total: number } | null;
}

export interface PlaylistsPage {
  items: SpotifyPlaylist[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
  previous: string | null;
}

export interface PlaylistTrackItem {
  added_at: string;
  track: SpotifyTrack | null;
}

export interface PlaylistTracksPage {
  items: PlaylistTrackItem[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
  previous: string | null;
}

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token: string;
}
