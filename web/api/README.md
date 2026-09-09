# Backend

the Express 5 + TypeScript service that powers stream resolution, muxing and the Spotify resolution race. for the project overview see [`../../README.md`](../../README.md). for self-hosting see [`../../docs/run-an-instance.md`](../../docs/run-an-instance.md).

## Layout

```text
backend/
├── src/
│   ├── app.ts              # Express setup, middleware, route wiring, lifecycle
│   ├── instrument.ts       # Sentry instrumentation — must load before app.ts
│   ├── controllers/
│   │   └── video.controller.ts       # /info, /convert, /stream-urls handlers
│   ├── routes/
│   │   └── video.routes.ts           # core video / stream endpoints
│   ├── services/
│   │   ├── spotify/        # ISRC race, Turso registry, AI query synthesis
│   │   ├── ytdlp/          # yt-dlp integration: streamer, info, turbo-mux, config
│   │   ├── extractors/     # pure-JS extractors (YouTube/FB/IG/TikTok/SoundCloud)
│   │   ├── seeder.service.ts         # background catalog seeder
│   │   ├── social.service.ts         # metascraper-based social-link metadata
│   │   ├── spotify.service.ts        # Spotify facade
│   │   └── ytdlp.service.ts          # yt-dlp facade
│   ├── utils/
│   │   ├── api/            # controller, response helpers
│   │   ├── infra/          # db (Turso), logger, queue, redis, trace
│   │   ├── media/          # format, fsm, metadata, spotify, stream, video
│   │   └── network/        # auth, cipher, cookie, proxy, secrets, security, sse, validation
│   └── types/              # shared TS types
├── tests/                  # Vitest suites + e2e helpers
├── scripts/                # test orchestration, benchmarks, Termux shim
└── Dockerfile              # container build (node:22-slim base)
```

## Routes

`video.routes.ts`:

| Method | Path                 | Purpose                                 |
| ------ | -------------------- | --------------------------------------- |
| `GET`  | `/events`            | SSE telemetry stream.                   |
| `GET`  | `/info`              | resolve a URL → metadata + format list. |
| `GET`  | `/stream-urls`       | refresh CDN URLs for a known video.     |
| `POST` | `/telemetry`         | frontend → backend telemetry ingest.    |
| `ALL`  | `/convert`           | stream / download a chosen format.      |
| `GET`  | `/proxy`             | authenticated stream proxy.             |
| `GET`  | `/seed-intelligence` | trigger the background catalog seeder.  |

`/convert` and `/proxy` are gated by `concurrencyGuard(2)` (`utils/network/security.util.ts`) to keep memory bounded on Termux and free-tier hosts.

response shapes for `/info` and `/convert` are documented in [`../../docs/api.md`](../../docs/api.md).

## Environment

configure via `web/api/.env`. the full reference is in [`../../docs/env-variables.md`](../../docs/env-variables.md). the api boots without most of these — they enable optional features and degrade gracefully when unset. minimum to get something useful:

- `REDIS_URL` — Redis for the metadata cache and BullMQ job queue (defaults to `redis://127.0.0.1:6379`).
- `GEMINI_API_KEY` and/or `GROQ_API_KEY` — at least one for the AI fallback in Spotify resolution.
- `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` — Spotify Web API for ISRC and metadata.
- `TURSO_URL` + `TURSO_AUTH_TOKEN` — global edge registry. unset is fine for local dev (falls back to an in-memory mock).
- `COOKIES_URL` — remote `yt-dlp` cookie sync. improves YouTube reliability.
- `API_ONLY=true` — disable serving the bundled `app/dist` (split deployments).

## Running

```bash
npm install
npm run dev          # tsc + node, listens on :5000 (or $PORT)
```

other scripts:

- `npm run build` — TypeScript compile to `dist/`.
- `npm test` — full Vitest suite (sequential, Termux-friendly).
- `npm run test:fast` — core regression tests only.
- `npm run test:lite` — node `--test` lite suite (no transpile).
- `npm run lint` — ESLint on changed files (`npm run lint:all` for the whole package).
- `npm run bench:convert` — convert-pipeline benchmark.

## Requirements

- Node.js ≥ 22 — matches the Dockerfile and the project root.
- `yt-dlp` and `ffmpeg` on `PATH`. `yt-dlp` is the fallback for sources without a native extractor; `ffmpeg` 7.x or 8.x handles muxing and audio transcoding.
- Redis. an in-process mock is used in tests when none is reachable.

## Notes

- **YouTube player clients**: `services/ytdlp/turbo-mux.ts` passes `--extractor-args youtube:player-client=...` to obtain DASH manifests and bypass the 360p limit on the default web client. the client list is chosen per request based on the requested format.
- **Concurrency**: `concurrencyGuard(limit)` (`utils/network/security.util.ts`) caps in-flight downloads at `limit=2` per process to prevent OOM on small hosts.
- **Cookie sync**: `utils/network/cookie.util.ts` pulls `youtube_cookies.txt` and `facebook_cookies.txt` from `COOKIES_URL` at boot when the variable is set.
- **MP3 transcoding**: `services/ytdlp/streamer.ts` pipes raw audio through `ffmpeg -vn -ab 192k -f mp3 pipe:1` straight to the client — no temp files.
- **MP4 finalization**: `-movflags +faststart` is set on finalized MP4 downloads so playback can start before the file finishes.
- **SSE**: `/events` is the canonical telemetry channel. resolvers, downloaders, and the seeder push progress through `utils/network/sse.util.ts`.

before putting an instance on the public internet, read [`../../docs/protect-an-instance.md`](../../docs/protect-an-instance.md).
