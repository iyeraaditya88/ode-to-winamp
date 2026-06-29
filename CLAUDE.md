# CLAUDE.md

Guidance for working in this repo. See [README.md](README.md) for setup, deploy, and feature docs — this file captures what isn't obvious from reading the code.

## What this is

**Ode to Winamp** — a self-hosted, cinematic music player for a user's **Spotify** library: a phantom.land-style WebGL grid of liked songs with in-browser playback (Web Playback SDK), synced + romanized lyrics, a Winamp-style visualizer, song recognition, and a Last.fm-powered Music Taste radar.

Next.js 14 (App Router, TypeScript) · Tailwind · React Three Fiber + three.js · Framer Motion · GSAP · TanStack React Query.

## Commands

```bash
npm run dev      # local dev — open http://127.0.0.1:3000 (NOT localhost, see below)
npm run build    # type-checks AND lints — run this before opening a PR
npm run lint     # eslint (next/core-web-vitals)
```

There is no test suite; `npm run build` is the gate for correctness (it fails on type or lint errors).

## Architecture

- `src/app/` — routes + API proxies. Every Spotify call is proxied through `src/app/api/*` server routes so tokens never reach the client. Notable routes: `api/auth/*` (login/callback/token/logout), `api/spotify/*` (liked-songs/search/play/like), `api/genres`, `api/similar` (Last.fm), `api/recognize` (AudD), `api/lyrics` (lrclib).
- `src/contexts/PlayerContext.tsx` — the playback engine: Web Playback SDK device lifecycle, queue, shuffle, device recovery. The single source of truth for "what's playing".
- `src/components/` — `Grid/` (WebGL sphere + lens distortion), `Player/` (PlayerBar, NowPlaying, ClassicWinamp skin), `Lyrics/`, `Equalizer/`, `MusicTaste/` (GenreRadar), `Recognize/`, `Landing/`, `Intro/`.
- `src/hooks/` — React Query data hooks (`useLikedSongs`, `useSearch`, `useLyrics`, `useMusicTaste`, `useRecognize`, like/share hooks).
- `src/lib/` — `auth.ts` (token cookies + refresh), `genres.ts` (taxonomy), `lrclib.ts`, `romanize.ts`, `share.ts`.
- `src/middleware.ts` — gates `/api/spotify/*` and `/api/lyrics` with a 401 if the `sp_access_token` cookie is absent.

## Auth model (important)

- OAuth tokens live in **httpOnly cookies** (`sp_access_token`, `sp_refresh_token`, `sp_expires_at`), set in `src/lib/auth.ts`. The client never sees them.
- Server routes call `getFreshAccessToken()` — it auto-refreshes an expired token and **re-persists** the rotated refresh token. Preserving a rotated refresh token matters: losing it can leave a second device (phone vs desktop refreshing concurrently) stuck initializing the playback SDK. Don't "simplify" this away.
- `cookies()` is read-only in some Next contexts, so the re-persist is wrapped in a try/catch — that's intentional, not dead code.

## Gotchas / platform constraints

- **Use `http://127.0.0.1:3000`, never `localhost`** — Spotify requires a loopback IP for http redirect URIs. `SPOTIFY_REDIRECT_URI` must match a URI registered in the Spotify dashboard *exactly*.
- The app runs in Spotify **Development Mode** by design (no Extended Quota for hobby apps). Consequences baked into the code, not bugs:
  - artist `genres` are stripped → Music Taste uses **Last.fm** (`api/genres`, `api/similar`), not Spotify;
  - recommendations / related-artists / audio-features are disabled → "explore" uses Last.fm similar artists, and the equalizer is a *simulated* visualizer (DRM audio can't be analyzed);
  - search caps at ~10 results; playback requires **Premium**.
- Optional features degrade gracefully to a "not configured" state when their key is missing: `AUDD_API_TOKEN` (recognition), `LASTFM_API_KEY` (Music Taste).

## Env

Copy `.env.example` → `.env.local`. Required: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `NEXT_PUBLIC_BASE_URL`. Optional: `AUDD_API_TOKEN`, `LASTFM_API_KEY`. Never commit `.env.local`.

## Conventions

- TypeScript throughout; path alias `@/*` → `src/*`.
- New Spotify-backed data should go through a server route under `src/app/api/` + a React Query hook in `src/hooks/`, never a direct client-side call with a token.
