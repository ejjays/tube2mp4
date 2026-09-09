# Environment Variables

Phantom boots without most of these — they enable optional features and degrade gracefully when unset. Backend vars go in `web/api/.env`, app vars in `web/app/.env`, mobile vars in `mobile/.env` (or `eas.json` for builds).

## Where to Get Keys

| Provider    | Link                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| Spotify     | [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → create app, copy client id + secret |
| Gemini      | [aistudio.google.com/api-keys](https://aistudio.google.com/api-keys) — free tier generous                        |
| Groq        | [console.groq.com/keys](https://console.groq.com/keys) — free tier generous                                      |
| Redis       | Local (`pkg install redis` on Termux) or free hosted [Aiven](https://aiven.io)                                   |
| Turso       | [app.turso.tech](https://app.turso.tech) → create DB, copy URL + auth token. CLI: `turso db tokens create <db>`  |
| Soundcharts | [soundcharts.com/api](https://soundcharts.com/api) — commercial, sandbox keys on request                         |
| AcoustID    | [acoustid.org/new-application](https://acoustid.org/new-application) → register app, copy API key (free)         |
| Kaggle      | [kaggle.com/settings](https://www.kaggle.com/settings) → "Create New API Token" (downloads `kaggle.json`)        |
| Sentry      | Project settings → Client Keys (DSN)                                                                             |

---

## API (`web/api/.env`)

### Core

| Variable    | Default | Purpose                                                  |
| ----------- | ------- | -------------------------------------------------------- |
| `PORT`      | `5000`  | Port the server listens on                               |
| `API_ONLY`  | `false` | Set `true` to serve only API (skip bundled app)          |
| `LOG_LEVEL` | `info`  | Log level                                                |
| `NODE_ENV`  | —       | `production` tightens logging; `test` set by test runner |

### Data & Cache

| Variable           | Default                  | Purpose                                                                                                                           |
| ------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`        | `redis://127.0.0.1:6379` | Redis for metadata cache + job queue                                                                                              |
| `TURSO_URL`        | —                        | libSQL/Turso URL for persistent edge registry. Falls back to in-memory mock if unset (and on Termux where native lib unavailable) |
| `TURSO_AUTH_TOKEN` | —                        | Auth token for Turso                                                                                                              |

### Extraction

| Variable             | Default                 | Purpose                                                                                                                                                                      |
| -------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COOKIES_URL`        | —                       | URL to fetch Netscape `cookies.txt` on startup — improves YouTube reliability                                                                                                |
| `YTDLP_COOKIES_FILE` | —                       | Path to local cookies file (overrides default location)                                                                                                                      |
| `YT_COOKIE`          | —                       | Cookie string for the JS Innertube client (youtubei.js)                                                                                                                      |
| `YT_DLP_COOKIE`      | —                       | Cookie string written to a temp cookies file for `yt-dlp`                                                                                                                    |
| `YT_DLP_ENHANCE`     | —                       | Set to run JS extraction eagerly alongside `yt-dlp` instead of only as fallback                                                                                              |
| `YT_JS_CLIENTS`      | `ANDROID_VR,IOS`        | Innertube clients used by JS extraction (some are SABR-only)                                                                                                                 |
| `YT_POTOKEN`         | `1`                     | PO-token generation for the JS client; set `0` to disable                                                                                                                    |
| `YT_POT_BASE_URL`    | `http://127.0.0.1:4416` | Base URL of the bgutil PO-token server                                                                                                                                       |
| `YT_PROXY`           | —                       | Experimental: route YouTube egress via a residential proxy (e.g. `http://user:pass@host:port`)                                                                               |
| `YT_PROXY_ALL`       | —                       | Apply `YT_PROXY` to all `yt-dlp` downloads, not just YouTube                                                                                                                 |
| `BILIBILI_COOKIE`    | —                       | Header-format cookie string (e.g. `SESSDATA=…; bili_jct=…`) from logged-in bilibili.tv session — unlocks 1080p+ on pure-JS Bilibili extractor. Unauthenticated caps at 720p. |
| `IG_COOKIE`          | —                       | Instagram session cookie — unlocks the authenticated media API (higher rate limits) instead of the throttled logged-out endpoint                                             |
| `DISABLE_YT_JS`      | —                       | Skip the JS Innertube client (warmup + extraction); use `yt-dlp` only                                                                                                        |
| `DISABLE_INFO_CACHE` | —                       | Disable the metadata info cache (testing)                                                                                                                                    |
| `ENABLE_POT_PLUGIN`  | `0`                     | Set `1` to auto-spawn bgutil PO-token server. Off by default (bgutil's BotGuard step currently flaky)                                                                        |

### Concurrency & Timeouts

| Variable                | Default       | Purpose                                    |
| ----------------------- | ------------- | ------------------------------------------ |
| `MAX_CONCURRENT_MEDIA`  | CPU count / 4 | Max parallel media downloads               |
| `MAX_CONCURRENT_PROXY`  | `6`           | Max parallel proxied requests              |
| `MEDIA_SLOT_TTL_MS`     | —             | Lease duration for concurrency-guard slots |
| `RESOLVE_TIMEOUT_MS`    | `30000`       | Timeout for a `/info` resolution           |
| `YOUTUBE_CLIENT_TTL_MS` | `4h`          | Reuse window for an Innertube client       |

### Hybrid Worker (phone + Koyeb failover)

| Variable              | Default | Purpose                                                                            |
| --------------------- | ------- | ---------------------------------------------------------------------------------- |
| `YTDLP_REMOTE_SECRET` | —       | HMAC secret shared with a remote `yt-dlp` worker (spare phone on a residential IP) |
| `YTDLP_REMOTE_URL`    | —       | Remote worker URL (auto-discovered from Turso when unset)                          |
| `PEER_RESOLVER_URL`   | —       | Peer resolver base URL for failover resolution (phone → Koyeb and back)            |
| `PEER_RESOLVE_HOSTS`  | —       | Comma-separated allowlist of peer hosts                                            |
| `PHONE_MEDIA_ENABLED` | —       | Set `1` to enable the phone media-relay path                                       |

### Metadata & AI (Music Resolution)

| Variable                                     | Default | Purpose                                                                                                 |
| -------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | —       | Spotify Web API credentials for track metadata                                                          |
| `SOUNDCHARTS_APP_ID`, `SOUNDCHARTS_API_KEY`  | —       | Soundcharts (ISRC-verified metadata)                                                                    |
| `ACOUSTID_API_KEY`                           | —       | AcoustID audio-fingerprint lookup (clip → MusicBrainz recording → ISRC). Degrades to Shazam when unset. |
| `GEMINI_API_KEY` (or `VERTEX_API_KEY`)       | —       | Gemini, used to synthesize search query when strict matches fail                                        |
| `GROQ_API_KEY`                               | —       | Groq/Llama, same fallback role                                                                          |

### Security (Set These for Public Instance)

| Variable                   | Default           | Purpose                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_MODE`                | inferred          | `open` (no auth), `apikey` (require key), or `deny` (block public). Unset → `apikey` if `API_KEY` set, else `deny` in production / `open` in dev. Localhost always allowed.                                                                                                                                                                            |
| `API_KEY`                  | —                 | If set, required on `/info`, `/stream-urls`, `/convert`, `/proxy`, `/api/*`. `127.0.0.1` exempt. Accepted via `Authorization: Bearer` or `X-API-Key` only.                                                                                                                                                                                             |
| `PROXY_SIGNING_SECRET`     | random per boot   | HMAC secret for signed proxy/stream URLs (stops `/proxy` open-relay abuse). Pin a fixed value (`openssl rand -hex 32`) so links survive restarts. **In hybrid/multi-backend setup (e.g. phone + Koyeb failover) every backend must use the _identical_ value** — otherwise a link signed by one box 403s on another and EME downloads fail mid-stream. |
| `PROXY_URL_TTL_SECONDS`    | `21600` (6h)      | Lifetime of a signed proxy/stream URL                                                                                                                                                                                                                                                                                                                  |
| `ALLOWED_ORIGINS`          | empty = allow all | Comma-separated CORS origin allowlist; when set, only listed origins get CORS headers                                                                                                                                                                                                                                                                  |
| `PROXY_ALLOW_INSECURE_TLS` | —                 | Allow `https://` proxied fetches to skip TLS verification (debug only)                                                                                                                                                                                                                                                                                 |

### Monitoring

| Variable                   | Default | Purpose                                  |
| -------------------------- | ------- | ---------------------------------------- |
| `SENTRY_DSN`               | —       | Sentry error/performance monitoring      |
| `KOYEB_INSTANCE_MEMORY_MB` | —       | Instance RAM limit reported on `/health` |

---

## App (`web/app/.env`)

| Variable          | Default | Purpose                                                                        |
| ----------------- | ------- | ------------------------------------------------------------------------------ |
| `VITE_API_URL`    | —       | Backend base URL (e.g. your tunnel URL). Required for app to reach remote API. |
| `VITE_SENTRY_DSN` | —       | Sentry DSN for the app                                                         |

---

## Mobile (`mobile/.env` / `eas.json` env)

All mobile env vars are `EXPO_PUBLIC_*` — bundled into the app, so treat as **public**. Never put true secrets in `EXPO_PUBLIC_*` vars.

| Variable                                                | Purpose                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`                              | Updates tab                                                                                    |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`                         | Updates tab                                                                                    |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`                      | Native Google sign-in (Web OAuth client ID)                                                    |
| `EXPO_PUBLIC_GIPHY_KEY`                                 | Giphy GIF picker in comments                                                                   |
| `EXPO_PUBLIC_BILIBILI_COOKIE`                           | Personal Bilibili cookie — **leave blank in public builds**                                    |
| `EXPO_PUBLIC_IG_COOKIE`                                 | Personal Instagram cookie (unlocks authenticated media API) — **leave blank in public builds** |
| `EXPO_PUBLIC_TURSO_URL`, `EXPO_PUBLIC_TURSO_READ_TOKEN` | Read-only edge registry (Spotify→YouTube mappings) — **must be read-only token**               |
| `EXPO_PUBLIC_SENTRY_DSN`                                | Error tracking                                                                                 |
| `EXPO_PUBLIC_DISABLE_FAST_RESOLVE`                      | Skip in-memory resolve cache                                                                   |

Spotify client id/secret are **not** app env vars — they live as secrets on the Supabase `spotify-token` edge function (`supabase secrets set SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=…` + `supabase functions deploy spotify-token`), and the app only receives short-lived tokens from it.

Local `.env` is gitignored. Preview/production builds need vars in `eas.json` `env`; dev client reads local `.env` through Metro.
