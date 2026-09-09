# Protecting a Public Instance

A localhost or personal instance needs no extra setup — auth is off by default. If you expose Phantom to the public internet, harden it as below. None of this requires paid infrastructure.

## 1. Require an API Key

Set `API_KEY` (see [`env-variables.md`](env-variables.md)). Once set, expensive routes (`/info`, `/stream-urls`, `/convert`, `/proxy`, `/api/*`) require it; `127.0.0.1` stays exempt so local tools keep working.

Clients can pass the key three ways:

```
Authorization: Bearer <key>
X-API-Key: <key>
```

> A public **web** frontend can't keep a key secret — anyone can read it in the browser. For an open, human-facing instance, use a bot challenge (e.g. Cloudflare Turnstile) instead of / alongside `API_KEY`, and reserve `API_KEY` for programmatic / API-only access.

## 2. Pin the URL-Signing Secret

`/proxy` and stream URLs are HMAC-signed with an expiry. By default the secret is random per boot, so links break on restart. Set a fixed `PROXY_SIGNING_SECRET` (and optionally tune `PROXY_URL_TTL_SECONDS`, default 6h) so signed links survive restarts. Forged or expired links get `403`.

## 3. Rate Limits (Already On)

Out of the box, the server applies:

- Global **100 requests / 15 min** on `/api/*`
- **15 requests / min** on `/info` and `/stream-urls`
- Per-IP **concurrency guard of 2** on `/convert` and `/proxy`

Tune these in `web/api/src/app.ts` if your traffic profile differs.

## 4. Terminate TLS in Front

Run behind a reverse proxy or tunnel that provides HTTPS. The server already sets `trust proxy`, Helmet headers, a CSP, and a 1 MB request-body cap.

## 5. Keep Secrets Out of Git

`web/api/.env` and cookie files are already in `.gitignore` — keep them there. Dependency scanning (`npm audit` + OSV-Scanner) runs in CI; for live malicious-package alerts, enable the Socket GitHub App.

For how to report a vulnerability, see [`../SECURITY.md`](../SECURITY.md).
