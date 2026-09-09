# Mobile App (Android)

Phantom has a standalone **Android app** (`mobile/`) — a native React Native / Expo build that runs the **entire pipeline on the phone**: resolve → download → mux → save. It talks to no backend and deliberately shares no code with `web/api/`.

## Why On-Device

The web build can offload muxing to the browser, but it still leans on a server for extraction, and that server is the weak point: free-tier hosting gets its datacenter IP bot-blocked by YouTube, and `yt-dlp` + `ffmpeg` are heavy enough to OOM it. A phone sidesteps both — it has a **residential IP** (no bot-block) and does its own compute (nothing to OOM, no server bill). Each user's device is its own worker.

This doesn't mean the server build is bad. With a capable host — enough RAM, plus a residential IP or proxies to keep YouTube happy — it runs great, and self-hosting it is a first-class path ([run an instance](run-an-instance.md)). On-device is simply the answer when you _don't_ have that: free/cheap hosting, a flagged datacenter IP, or no server at all.

## What It Does

- **15 platforms** resolve through dedicated on-device pure-JS extractors — no `yt-dlp`, no native subprocess.
- **YouTube** runs in a hidden WebView that generates a BotGuard **PO token** and deciphers streams on the device's residential IP.
- **Downloads** pull `googlevideo` in parallel 4 MB ranged chunks to beat the playback-rate throttle.
- **Muxing** stitches adaptive HD video + audio with `ffmpeg-kit` (`-c copy`, no re-encode) and saves straight to the gallery.
- A small **Updates tab** (Supabase) adds app news, reactions, and comments.

> Android only — iOS code ships in some deps but is untested and unsupported.

## Full Documentation

Architecture, the complete extractor list, the stack, EAS build profiles, env vars, and testing all live in the app's own README:

➡️ **[`../mobile/README.md`](../mobile/README.md)**
