# Contributing

Thanks for your interest in improving Ode to Winamp! 🎧

## Getting set up

Follow the [README](./README.md) to create your Spotify app and configure
`.env.local`. Then:

```bash
npm install
npm run dev   # http://127.0.0.1:3000
```

## Before opening a PR

- Run `npm run build` — it type-checks **and** lints. CI runs the same, so a
  green build locally means a green PR.
- Keep changes focused; match the surrounding code style (it's plain
  TypeScript + Tailwind, no formatter config to fight).
- If you touch playback, the WebGL grid, or anything mobile, please sanity-check
  on a phone too — the Spotify Web Playback SDK is finicky on mobile browsers.

## Good to know

- This app runs against Spotify **Development Mode**, which strips genres and
  blocks recommendations/audio-features for hobby apps. Genre + "explore" data
  therefore comes from **Last.fm**, not Spotify — see the README's *Known
  limitations*. Please don't open PRs that re-add the dead Spotify endpoints.
- Optional features degrade gracefully when their keys are absent
  (`AUDD_API_TOKEN`, `LASTFM_API_KEY`) — keep that behavior.

## Reporting bugs / ideas

Use the issue templates. For playback bugs, include your browser/OS and whether
it's desktop or the installed PWA.
