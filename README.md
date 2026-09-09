<p align="center">
  <a href="https://github.com/ejjays/phantom">
    <img width="1400" height="460" alt="Cyan Phantom" src="mobile/assets/phantom-hero.svg" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/ejjays/phantom/actions/workflows/ci.yml"><img src="https://github.com/ejjays/phantom/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://app.deepsource.com/gh/ejjays/phantom/"><img src="https://app.deepsource.com/gh/ejjays/phantom.svg/?label=active+issues&show_trend=true&token=AjSUM1LGBlY2Uzo6_spxrx9Q" alt="DeepSource" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=flat" alt="License: Apache 2.0" /></a>
</p>

---

## What this is

Phantom downloads 4K+ video and audio. It pushes heavy media work onto your device (browser or phone) instead of a server — so it stays free, ad-free, and unmetered.

**Two deployment targets, one codebase:**

| Target          | What runs where                                                                | Repo path |
| --------------- | ------------------------------------------------------------------------------ | --------- |
| **Web app**     | Extraction/mux on server (Node), browser mux via `mediabunny`, server fallback | `web/`    |
| **Android app** | Full pipeline on-device (Expo RN, Hermes, ffmpeg-kit)                          | `mobile/` |

---

## Mobile App Preview

<table align="center">
  <tr>
    <td align="center"><img src="mobile/assets/screenshots/home_screen.webp" width="150" alt="Home Screen" /></td>
    <td align="center"><img src="mobile/assets/screenshots/video_download.webp" width="150" alt="Video Download" /></td>
    <td align="center"><img src="mobile/assets/screenshots/audio_download.webp" width="150" alt="Audio Download" /></td>
  </tr>
  <tr>
    <td align="center"><img src="mobile/assets/screenshots/updates_feed.webp" width="150" alt="Updates Feed" /></td>
    <td align="center"><img src="mobile/assets/screenshots/update_detail.webp" width="150" alt="Update Detail" /></td>
    <td align="center"><img src="mobile/assets/screenshots/comments_section.webp" width="150" alt="Comments" /></td>
  </tr>
  <tr>
    <td align="center"><img src="mobile/assets/screenshots/settings_screen.webp" width="150" alt="Settings" /></td>
    <td align="center"><img src="mobile/assets/screenshots/account_details.webp" width="150" alt="Account" /></td>
    <td align="center"><img src="mobile/assets/screenshots/choose_avatar.webp" width="150" alt="Avatar" /></td>
  </tr>
</table>

---

---

## Supported platforms

| Platform    | Web | Mobile | Video | Audio | Images | Notes                                      |
| ----------- | :-: | :----: | :---: | :---: | :----: | ------------------------------------------ |
| YouTube     | ✅  |   ✅   |  ✅   |  ✅   |   ➖   | playlists, shorts, 4K                      |
| Spotify     | ✅  |   ✅   |  ✅   |  ✅   |   ➖   | tracks & albums resolve via youtube search |
| SoundCloud  | ✅  |   ✅   |  ➖   |  ✅   |   ➖   | audio-only service                         |
| Bilibili    | ✅  |   ✅   |  ✅   |  ✅   |   ➖   | some videos need a cookie                  |
| TikTok      | ✅  |   ✅   |  ✅   |  ✅   |   ✅   | videos + photo carousels                   |
| Instagram   | ✅  |   ✅   |  ✅   |  ✅   |   ✅   | reels, posts, multi-image picker           |
| Facebook    | ✅  |   ✅   |  ✅   |  ✅   |   ✅   | public posts only                          |
| Threads     | ✅  |   ✅   |  ✅   |  ✅   |   ✅   |                                            |
| X / Twitter | ✅  |   ✅   |  ✅   |  ✅   |   ➖   | videos & gifs only                         |
| Bluesky     | ✅  |   ✅   |  ✅   |  ❌   |   ➖   | hls only, no audio                         |
| Vimeo       | ✅  |   ✅   |  ✅   |  ❌   |   ➖   | hls only, no audio                         |
| Dailymotion | ✅  |   ✅   |  ✅   |  ❌   |   ➖   | hls only, no audio                         |
| Reddit      | ✅  |   ✅   |  ✅   |  ✅   |   ➖   |                                            |
| Pinterest   | ✅  |   ✅   |  ✅   |  ✅   |   ✅   | video pins + photos                        |
| Twitch      | ✅  |   ✅   |  ✅   |  ❌   |   ➖   | clips, hls only                            |
| Snapchat    | ✅  |   ✅   |  ✅   |  ✅   |   ➖   | spotlight videos + t.snapchat.com shorts   |

---

## Quick start (web)

```bash
# Prerequisites: Node 22+, yt-dlp, ffmpeg, Redis
git clone https://github.com/ejjays/phantom.git
cd phantom

npm install              # root tooling (husky, prettier)
npm run install:web      # installs app, api, shared

# Create env files (see docs/env-variables.md)
cp web/api/.env.example web/api/.env
cp web/app/.env.example web/app/.env

# Dev (two terminals)
npm run api   # api on :5000
npm run ui    # app dev server
```

**Production-style:**

```bash
npm run build:api
npm run build:ui
cd web/api && npm start
```

**Docker (api only):**

```bash
docker build -f web/api/Dockerfile -t phantom .
docker run -p 8000:8000 --env-file web/api/.env phantom
```

---

## Quick start (Android)

```bash
cd mobile
npm install
npm start       # Expo dev client
# or
eas build --profile development  # dev client APK
```

Prebuilt APKs: built via EAS on GitHub Actions (`build-apk.yml`, `eas build --local`, profiles development/preview/production) and downloadable from the workflow's artifacts. Android only — iOS untested/unsupported.

---

## Architecture overview

```
phantom/
├── web/
│   ├── app/            # React 19 + Vite + Tailwind + Styled Components
│   ├── api/            # Express 5 + yt-dlp + ffmpeg + Redis + Turso
│   ├── site/           # Astro landing page (merges app under /app/ at deploy)
│   └── shared/         # @phantom/shared (Zod schemas)
├── mobile/             # Expo SDK 57, RN 0.86, Hermes, New Arch
│   ├── src/extractors/ # 16 pure-JS platform extractors
│   ├── src/lib/        # download pipeline, social, net, notify
│   └── src/components/ # UI, sheets, backgrounds, webviews
├── packages/
│   ├── extractors/     # @phantom/extractors (shared fb/threads/social)
│   └── web-mux/        # @phantom/web-mux (shared media mux core)
├── scripts/            # termux install, tunnels
└── docs/               # self-host, env, hardening, API, mobile
```

**Key architectural decisions:**

- **No server for mobile** — each phone is its own residential IP + compute. Avoids datacenter bot-blocks and OOM kills on free tiers.
- **Client-side muxing is primary** — `mediabunny` (pure-JS muxer) runs in a Web Worker, streams to OPFS. Server fallback via `ffmpeg -c copy` only when client mux fails or browser unsupported.
- **Googlevideo throttle bypass** — api uses 8 MB ranged chunks, mobile uses 4 MB. Both parallel with per-chunk retry.

---

## Documentation

| Doc                                                          | What it covers                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [`docs/run-an-instance.md`](docs/run-an-instance.md)         | Prerequisites, Termux, Docker, tunnels, dev/prod commands              |
| [`docs/env-variables.md`](docs/env-variables.md)             | Every env var, defaults, where to get API keys                         |
| [`docs/protect-an-instance.md`](docs/protect-an-instance.md) | Hardening a public deployment (API key, URL signing, rate limits, TLS) |
| [`docs/api.md`](docs/api.md)                                 | Endpoint contracts, request/response shapes, SSE events                |
| [`docs/mobile-app.md`](docs/mobile-app.md)                   | Android app architecture, extractors, download pipeline, EAS build     |
| [`docs/phone-worker-setup.md`](docs/phone-worker-setup.md)   | Legacy: using a spare phone as yt-dlp/media relay for the web API      |

---

**Apache-2.0** for the main apps (`web/`, `mobile/`).

**MIT** for standalone packages in `packages/` (`@phantom/extractors`, `@phantom/web-mux`) — each carries its own LICENSE.

See [`LICENSE`](LICENSE) and [`packages/*/LICENSE`](packages/extractors/LICENSE).

---

## Disclaimer

Use responsibly. Download only content you have rights to. No piracy.
