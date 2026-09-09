---
title: Phantom Backend
emoji: 🎬
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
short_description: Phantom media backend (experimental)
---

# Phantom Backend — Hugging Face Space

Experimental Docker deployment of the Phantom Express backend.

This Space serves the API only (`API_ONLY=true`). The container listens on
`7860` (matching `app_port`).

## Required Space secrets

Set these in **Settings → Variables and secrets** (they are injected as env
at runtime):

- `PROXY_SIGNING_SECRET` — pin it so signed `/proxy` links survive restarts
- `COOKIES_URL` — remote cookies source (storage here is ephemeral)
- `ALLOWED_ORIGINS` — your frontend origin(s), comma-separated
- Redis connection vars (e.g. `REDIS_URL`)
- Turso vars (`TURSO_URL`, `TURSO_AUTH_TOKEN`)
- `GEMINI_API_KEY`, `GROQ_API_KEY`
- `YT_PROXY` — optional; residential proxy for YouTube (experiment branch)

`NODE_ENV` is already set to `production` in the Dockerfile (must not be
`test`, or the server won't start).
