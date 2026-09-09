# @phantom/extractors

pulls the JS extractors out of `web/api` into a standalone, dependency-free
package. it's the sibling to [`../web-mux`](../web-mux/README.md) — this
resolves a URL into format URLs, web-mux combines separate video/audio URLs
into one file.

## The pattern

each extractor is a factory that takes an `ExtractorEnv` instead of importing
project internals (`secureFetch`, `getProxiedStream`, redis, express, etc.):

```ts
export interface ExtractorEnv {
  fetch: typeof fetch;
  streamUrl(
    url: string,
    headers: Record<string, string>
  ): Promise<ReadableStream>;
  /** HLS-only platforms (bluesky, twitch VOD) need this for getStream() */
  remuxHls?(
    url: string,
    headers: Record<string, string>
  ): Promise<ReadableStream>;
  /** applied to every fetch; defaults to 10s. set 0 to disable */
  timeoutMs?: number;
  /** skip the extra round-trip that measures HLS duration */
  skipDurationFetch?: boolean;
  oembedThumb?(url: string): Promise<string | undefined>;
  ogImageThumb?(url: string): Promise<string | undefined>;
  cookie?: string;
  authedFetch?(url: string, headers: Record<string, string>): Promise<Response>;
  fetchSessionHeaders?(
    url: string,
    headers: Record<string, string>
  ): Promise<{ ok: boolean; status: number; setCookie: string | null }>;
}
```

pass nothing (`createXExtractor()`) and it uses plain global `fetch`, or
inject your own SSRF-safe fetch / proxy pool / auth headers.

every request goes through `env.timeoutMs` (default 10s), so a slow platform
can never hang your process. set it to `0` only if your injected fetch
already enforces its own deadline.

per-extractor state (soundcloud's `client_id`, tiktok's cookie jar, reddit's
session) is scoped to the instance, so two consumers with different envs
never share credentials.

ported so far: `x`, `bluesky`, `vimeo`, `dailymotion`, `pinterest`,
`reddit`, `snapchat`, `twitch`, `soundcloud`, `bilibili`, `facebook`,
`threads`, `tiktok`, `instagram` — 14 platforms. each one runs its output
through `normalizeTitle`/`normalizeArtist` (vendored from
`social.service.ts`) before returning, so titles/uploaders match what the
app shows — not just raw platform data.

`getRouteName(url)` returns the stable platform id from `ROUTES`. Both
consumers use it for metrics and labelling, and both run live e2e against
the same fixtures (`web/api/tests/e2e/cases.json`,
`mobile/.maestro/e2e-cases.json`), so adding a platform to `ROUTES` routes,
labels and gates it in both.

for URLs you don't want to route by hand, `resolve(url)` picks the right
extractor by host and calls `getInfo` in one step; `getExtractor(url)` gives
you the extractor instance directly (for when you also need `getStream`):

```ts
import { resolve, getExtractor } from '@phantom/extractors';

const info = await resolve('https://vimeo.com/76979871');

const extractor = getExtractor('https://vimeo.com/76979871');
const stream = extractor && (await extractor.getStream(info));
```

### Failure contract

every platform fails the same way: it **throws** a typed `ExtractorError`.
`null` is reserved for "this URL isn't for me" — never for "something broke".

```ts
import { resolve, ExtractorError } from '@phantom/extractors';

try {
  const info = await resolve(url); // null => no extractor for this host
  if (!info) return fallback(url);
} catch (error) {
  if (!(error instanceof ExtractorError)) throw error;
  if (error.retryable) return scheduleRetry(url); // 429, 5xx, socket death
  if (error.expected) return tellUser(error.message); // private/removed/login
}
```

| flag        | meaning                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- |
| `retryable` | worth trying the same URL again (rate limit, server error, network)                      |
| `expected`  | the platform's answer, not our bug — safe to show the user, safe to skip crash reporting |

transport failures are detected via `error.code` / `error.cause.code`
(`ENOTFOUND`, `ECONNRESET`, `ETIMEDOUT`, `AbortError`, …), not by grepping
the message string.

### Reusing the internals

if you're writing your own extractor alongside these (like `web/api`'s
youtube or `mobile`'s spotify), import the shared primitives instead of
copying them — `@phantom/extractors/shared` (or the root export) gives you
`envFetch`, `probeFileSize`, `backfillSizes`, `parseHlsMaster`,
`selectFormat`, `buildVideoInfo`, `hostOf` and the error factories.

`buildVideoInfo` is the only place a `VideoInfo` should be constructed; it
applies the defaults and enforces `isPartial ⇒ !isFullData`.

### Scope: what this is not

this package stops at "resolve a URL into normalized metadata + formats." it
does **not** include the racing orchestrator or metascraper fallback that
`web/api/extractors/index.ts` has — the layer that races the real
extractor against an oEmbed/metascraper fetch and fires an early "metadata
found" progress event for the picker UI. that's left out on purpose:

- **metascraper is Node-only** (pulls in `got`, HTML scraping) — adding it
  would break this package's one real selling point, that it runs in Node,
  React Native, and the browser alike.
- **the racing/timeout/progress-event behavior is UI policy**, tuned to one
  app's picker modal — not something a generic library should dictate to
  every consumer.
- it's cheap to rebuild on top: `Promise.race([resolve(url), yourOwnMetadataFetch(), timeout(8000)])`
  is a few lines against the exports this package already gives you. you
  don't need the library to own the race, just to return promptly and
  resolve to `null` cleanly on a miss — which it already does.

### The ffmpeg wrinkle (bluesky, vimeo HLS fallback)

bluesky's streams are always HLS (`.m3u8`); vimeo falls back to HLS when no
progressive mp4 exists. the original app remuxes these with a spawned
`ffmpeg` process, which isn't something a pure-JS library should hardcode
(native binary dependency, breaks in browsers/RN). instead `getStream()`
calls an optional `env.remuxHls(url, headers)` hook and throws a clear error
if it's missing, rather than silently shelling out.

## Verifying it

two checks, both real (not mocks):

1. **`npm run demo:mock`** — builds `dist/` and runs `examples/mock-demo.ts`
   against the built output, using the same fixture as
   `web/api/tests/extractors/x_extractor.test.ts`.
2. **tarball install** — `npm pack`, install the `.tgz` into a scratch
   project, run a script that imports `@phantom/extractors` from
   `node_modules`. catches "works in the repo, missing from what gets
   published" bugs that `demo:mock` alone can't.

`dist/` is built at `prepack` time and shipped prebuilt — there is no
install-time build step, so `--ignore-scripts` consumers work too.
`npm run build` starts from a clean `dist/` so stale artifacts can't
accumulate.

`examples/live-real.mjs` also runs the built package against real hosts,
using the same URLs as `mobile/tests/live/live-cases.json` — x.com, bsky.app,
vimeo.com — including a real `vimeo.getStream()` pulling actual bytes off
Vimeo's CDN.

## What's still unresolved

- `spotify` ships as shared metadata helpers only (`parseTrackId`,
  `parseEmbedHtml`, `mergeSpotifyMeta`, embed/odesli fetchers) — full
  resolution stays runtime-local (web: brain registry + soundcharts;
  mobile: supabase token + on-device youtube match). `youtube` stays split
  too (server `youtubei.js` vs WebView BotGuard) — same reason.
- `env.remuxHls` is unimplemented in `defaultEnv` — a consumer wanting
  bluesky or HLS-fallback vimeo streams has to supply it themselves (e.g.
  spawn `ffmpeg`, or a WASM remuxer for browser/RN use).
- no `getStream` proxy hardening (SSRF checks) in `defaultEnv` — intentional,
  keeps the lib dependency-free, but means server-side consumers should
  inject their own `streamUrl`.
- MIT — repo root is Apache-2.0, but this package is permissively licensed so any project can adopt it; see root README.
