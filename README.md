# Ode to Winamp

A custom, cinematic music player for your **Spotify** library — a phantom.land‑style WebGL sphere of your liked songs you can drag, zoom and keyboard‑navigate, with in‑browser playback, synced & romanized lyrics, a Winamp‑style visualizer, song recognition, and a **Music Taste** genre‑spectrum radar.

> ⚠️ **Read this first — how you run it matters.** Spotify only grants this kind of app **Development Mode**, which means you can't host one public instance for the world. Instead, **each person runs their own copy** with their own free Spotify app credentials (and adds themselves to their app's user list). This README walks you through that. It takes ~10 minutes and needs **Spotify Premium** for playback.

---

## Features

- 🎛️ **WebGL liked‑songs grid** — an infinite, draggable, zoomable lens‑distortion "sphere" of your album art (inspired by [phantom.land](https://phantom.land)). Drag to pan, scroll/pinch to zoom, arrow keys to navigate, tap/Enter to play.
- ▶️ **In‑browser playback** via the Spotify Web Playback SDK (Premium), with queue, shuffle, and a draggable Now‑Playing sheet.
- 🎤 **Lyrics** — time‑synced sing‑along (lrclib.net) with one‑tap **romanization** for non‑Latin scripts.
- 📈 **Equalizer** — a customizable Winamp‑style visualizer (themes + styles).
- ❤️ **Like / unlike** from anywhere; 🔗 **share**; 📱 **PWA** with lock‑screen / Control‑Center controls (Media Session).
- 🔎 **Search** your whole Spotify catalog.
- 🎧 **Identify a song** (Shazam‑style) via the mic — *optional, needs an AudD key*.
- 🧬 **Music Taste** — a genre‑spectrum **radar** of your taste, top bands, top songs, and refreshable "explore next" recommendations — *optional, needs a Last.fm key*.

---

## Tech stack

Next.js 14 (App Router, TypeScript) · Tailwind CSS · React Three Fiber + three.js (WebGL grid) · Framer Motion · GSAP · TanStack React Query · Spotify Web API + Web Playback SDK.

---

## Prerequisites

- **Node.js 18+** and npm
- A **Spotify account** — **Premium is required for playback** (free accounts can browse but the Web Playback SDK won't play audio)
- *(Optional)* an [AudD](https://audd.io) account for song recognition
- *(Optional)* a [Last.fm API key](https://www.last.fm/api) for the Music Taste section

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/iyeraaditya88/ode-to-winamp.git
cd ode-to-winamp
npm install
```

### 2. Create your Spotify app (required)

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → **Create app**.
2. Note the **Client ID** and **Client Secret**.
3. Under **Edit settings → Redirect URIs**, add **both**:
   - Local dev: `http://127.0.0.1:3000/api/auth/callback`
     *(Spotify requires a loopback IP for http — use `127.0.0.1`, not `localhost`.)*
   - Production: `https://YOUR-DOMAIN.vercel.app/api/auth/callback`
4. Under **APIs used**, make sure **Web API** and **Web Playback SDK** are enabled.
5. **Add yourself as a user:** the app is in *Development Mode*, so under **User Management** add the **Spotify email of every person** who will use your instance (up to 25). If you skip this, login fails with `User not registered`.

### 3. (Optional) Get the extra keys

- **AudD** (song recognition): sign up at [audd.io](https://audd.io) → copy your API token. Without it, the mic/identify feature shows a "not configured" state.
- **Last.fm** (Music Taste): create a key at [last.fm/api](https://www.last.fm/api/account/create) → copy the **API key** (the shared secret isn't needed). Without it, the Music Taste panel shows a "not configured" state.

### 4. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Required | What it's for |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | ✅ | Your Spotify app client id |
| `SPOTIFY_CLIENT_SECRET` | ✅ | Your Spotify app client secret |
| `SPOTIFY_REDIRECT_URI` | ✅ | Must exactly match a redirect URI you registered (e.g. `http://127.0.0.1:3000/api/auth/callback` for local) |
| `NEXT_PUBLIC_BASE_URL` | ✅ | Your app's base URL (e.g. `http://127.0.0.1:3000` for local) |
| `AUDD_API_TOKEN` | ⬜ optional | Enables song recognition |
| `LASTFM_API_KEY` | ⬜ optional | Enables the Music Taste section |

### 5. Run

```bash
npm run dev
```

Open **http://127.0.0.1:3000** (use the same host as your redirect URI), click **Connect Spotify**, and you're in.

---

## Deploy (Vercel)

1. Push your fork to GitHub and import it at [vercel.com/new](https://vercel.com/new) (Next.js is auto‑detected).
2. Add the same env vars in **Project → Settings → Environment Variables**, but set:
   - `SPOTIFY_REDIRECT_URI` = `https://YOUR-DOMAIN.vercel.app/api/auth/callback`
   - `NEXT_PUBLIC_BASE_URL` = `https://YOUR-DOMAIN.vercel.app`
3. Add that production redirect URI in the Spotify dashboard (step 2.3 above).
4. Deploy. Every push to `main` redeploys automatically.

---

## Known limitations (Spotify Development Mode)

This app is intentionally self‑hosted because Spotify won't grant a hobby app "Extended Quota". In Development Mode (as of Spotify's 2026 API changes), your app:

- is limited to **25 manually‑added users** (you add their emails in the dashboard);
- **cannot read genres** from Spotify (artist `genres` are stripped) → the Music Taste section uses **Last.fm** instead;
- has **recommendations / related‑artists / audio‑features** disabled → "explore" uses **Last.fm similar artists**, and the equalizer is a tasteful simulation (DRM audio can't be analyzed anyway);
- **caps search at ~10 results** and **requires Premium** for playback.

None of these are bugs — they're the platform's constraints, documented so you know what to expect.

---

## Project structure

```
src/
  app/            # routes + API proxies (auth, spotify/*, genres, similar, recognize, lyrics)
  components/     # Grid (WebGL), Player, Lyrics, Equalizer, MusicTaste, Recognize, Landing
  contexts/       # PlayerContext (playback engine + device recovery)
  hooks/          # useLikedSongs, useSearch, useLyrics, useMusicTaste, …
  lib/            # auth (token cookies), genres (taxonomy), share, lrclib, romanize
```

---

## Contributing

Issues and PRs welcome. Please run `npm run build` (it type‑checks and lints) before opening a PR.

## License

[MIT](./LICENSE) — do whatever you like; no warranty.

## Acknowledgements

Visual inspiration: [phantom.land](https://phantom.land). Built on the [Spotify Web API & Web Playback SDK](https://developer.spotify.com/), [lrclib.net](https://lrclib.net) (lyrics), [AudD](https://audd.io) (recognition), and [Last.fm](https://www.last.fm/api) (genres & similar artists).
