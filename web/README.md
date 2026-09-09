# Web

website/browser side of Phantom and API. for the project overview see [`../README.md`](../README.md).

four parts, installed together from the **root npm workspace** (single `package-lock.json`):

- **`app/`** — the React 19 SPA (Vite, Tailwind). the actual downloader app, served under `/app/`. does browser-side muxing and talks to the API over SSE. deploys to **Cloudflare Pages** (`nex-stream`; Vercel is a redirect shell, `functions/` are Pages Functions).
- **`site/`** — the Astro landing site. at deploy time the SPA build is merged into it (`scripts/build-site.sh` copies `app/dist` → `site/dist/app`), so the landing page and the app ship as one deploy.
- **`api/`** — the Express 5 API: stream resolution, muxing and the Spotify race. deploys to **Koyeb** (Docker); an experimental **HF Spaces** Docker deploy also exists (`Dockerfile.hf`).
- **`shared/`** — zod schemas + cross-workspace types. both import it via the `@shared/*` alias; it ships nowhere on its own.

`app` and `api` never import each other — the only thing they share is `shared/`, so the contract between them lives there.

to install all four at once, run `npm run install:web` from the repo root — it installs the root workspace and builds `@phantom/extractors`. to add a package, install it from the root (workspace-wide).
