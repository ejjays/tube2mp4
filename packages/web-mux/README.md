# @phantom/web-mux

the browser-side muxing half of the app, pulled out of `web/app/src/lib` (`mux-core.ts`, `muxer.ts`, `mux.worker.ts`, `mux-codecs.ts`) into something standalone. it's the sibling to [`../extractors`](../extractors/README.md) — extractors resolve a URL into separate video/audio format URLs, this takes those two URLs and combines them into one mp4, entirely in the browser, no server transcode.

## What it does

hand it a `videoUrl` and an `audioUrl`, it hands back an mp4 `Blob` — video and audio remuxed (not re-encoded) into one file. this is what makes DASH-style sources (separate video/audio streams, e.g. youtube) downloadable as one file without your backend ever touching the bytes.

```ts
import { muxToMp4 } from '@phantom/web-mux';

const blob = await muxToMp4({
  videoUrl,
  audioUrl,
  workerUrl: new URL('@phantom/web-mux/worker', import.meta.url),
  onProgress: (pct, detail) => console.log(pct, detail),
});
```

## How it works

- **worker + OPFS path (preferred).** given a `workerUrl`, it spins up a Worker that downloads both streams straight to Origin Private File System via `createSyncAccessHandle`, then remuxes disk-to-disk. bytes never sit in tab memory, which is the whole point — that's what lets large/4K downloads survive past the ~500MB ceiling that kills a main-thread buffered approach.
- **main-thread fallback.** no `workerUrl`, no OPFS, or no Worker support (older browsers) — falls back to buffering both streams as blobs on the main thread and muxing there. slower and RAM-bound, but works everywhere `fetch` + `Blob` do.
- **codec veto.** before muxing, it checks both codecs are copy-safe for mp4 (vp8/vorbis aren't — those need a real transcode, not a remux) and throws `UnsupportedMuxCodecError` early instead of producing a broken file.
- **resumable downloads.** the worker path fetches with byte-range resume on drop, and refuses to silently continue if the server's reported size changes mid-download (`SizeMismatchError`) — that's what stops a mid-fetch CDN swap from corrupting the output.

## The pieces

| File                | Role                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `core.ts`           | `copyMuxTracks` — the actual remux: reads packets from both inputs, writes a fragmented mp4 |
| `codecs.ts`         | copy-safety check (`shouldVetoCopyMux`) — zero deps, easy to unit test alone                |
| `resumableFetch.ts` | range-resume fetch-to-sink, used by the worker path                                         |
| `worker.ts`         | the off-main-thread job runner — download-to-OPFS + mux-to-OPFS, `postMessage` protocol     |
| `muxer.ts`          | public entry (`muxToMp4`) — picks worker-vs-main-thread, OPFS bookkeeping                   |

## What changed from the original

- the `?via=eme` query-tag and `panther-mux-` OPFS filename prefix were panther-specific (analytics tagging, app branding) — dropped the tag, made the prefix a `filePrefix` option instead.
- the worker is no longer hardcoded to `./mux.worker.ts` next to the caller — a package can't assume where it'll be bundled from, so `workerUrl` is now an explicit option (see the `"./worker"` export in `package.json`).
- everything else — the copy-mux logic, the resumable fetch, the codec veto — ported as-is. it was already app-agnostic (no store/telemetry/Sentry imports), so this was mostly a lift, not a rewrite.

## Verifying it

`examples/browser-verify/` runs `muxToMp4` in real headless Chromium via Playwright (not jsdom) — both the worker+OPFS path and the main-thread fallback, against a synthetic ffmpeg-generated pair and a real YouTube DASH pair (small itags off a public-domain video, so it stays a few MB):

```bash
npm run build
cd examples/browser-verify

ffmpeg -y -f lavfi -i "testsrc=size=640x360:rate=30:duration=3" -c:v libx264 -pix_fmt yuv420p -an public/video-only.mp4
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3" -c:a aac public/audio-only.mp4

# optional: a real pair, for testing against actual CDN behavior
yt-dlp -f 160 -g "https://www.youtube.com/watch?v=aqz-KE-bpKQ" | xargs -I{} curl -sL -o public/real-video.mp4 "{}"
yt-dlp -f 139 -g "https://www.youtube.com/watch?v=aqz-KE-bpKQ" | xargs -I{} curl -sL -o public/real-audio.m4a "{}"

node run.mjs
```

`public/*` is gitignored — nothing from these runs gets committed.

## Notes

- `mediabunny` is a real dependency, not optional — there's no "plain fetch" equivalent for WebCodecs muxing, so this isn't zero-dep like the extractors package.
- OPFS + `createSyncAccessHandle` are worker-only APIs — the main-thread fallback is there for compatibility, not performance, and will struggle on very large files.
- only remuxes copy-safe codecs; vp8/vorbis sources need a real transcode, which is out of scope here.
- license: **MIT** (deliberate) — repo root is Apache-2.0, but this package is permissively licensed so any project can adopt it; see root README.
