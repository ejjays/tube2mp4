# Contributing

Thanks for reading this. If you're thinking about contributing, I genuinely appreciate it — as a solo dev it's been a challenge and working with other engineers would mean a lot.

If anything here is unclear, don't worry about getting it perfect — open an issue, say hi, and we'll figure it out together.

## Project Structure

Phantom is a multi-target repo:

| Target         | Path          | Stack                                                |
| -------------- | ------------- | ---------------------------------------------------- |
| Web API        | `web/api/`    | Express 5 + TS, yt-dlp, ffmpeg, Redis, Turso         |
| Web app        | `web/app/`    | React 19 + Vite, Tailwind + Styled Components        |
| Shared schemas | `web/shared/` | Zod schemas (`@phantom/shared`)                      |
| Android app    | `mobile/`     | Expo SDK 57, RN 0.86, Hermes, New Architecture       |
| Packages       | `packages/`   | `@phantom/extractors`, `@phantom/web-mux` (both MIT) |

## Getting Set Up

Prerequisites and install steps live in [`docs/run-an-instance.md`](docs/run-an-instance.md). Short version:

- Node 22+, `yt-dlp`, `ffmpeg`, Redis
- `npm install` at the repo root — npm workspaces pulls in `web/`, `mobile/`, and `packages/*` from the single root lockfile

Once that's done:

```bash
npm run api      # api (dev, :5000)
npm run ui       # app (Vite dev server)
npm run check    # typecheck + lint on changed files — fast, run often
npm run check:all # same across whole repo — run before opening a PR
```

## Running Tests

GitHub CI is the suite runner — full suites don't run on-device. Locally, run only the single test file relevant to your change:

```bash
cd web/app && node ../../node_modules/vitest/vitest.mjs run tests/<file>.test.ts
```

(same pattern from `web/api` and `mobile`; the direct `node` path sidesteps Termux's bin-shebang issue). For everything else, push your branch and let CI run it: app, mobile, api (with Redis), and live extractor checks.

If you're fixing a bug or adding a feature, a test that covers it really helps — ideally one that fails first, then passes. Mocking external calls (YouTube, Spotify, Redis) keeps tests fast and offline.

## Continuous Integration

CI runs on GitHub Actions — see [`.github/workflows/`](.github/workflows/). `ci.yml` ("Checks") path-filters by workspace and runs typecheck + lint + tests for api/app/mobile, plus mobile live extractor checks and a Cloudflare Pages deploy on `main`. `audit.yml` scans dependencies (lockfile signature, `npm audit`, OSV-Scanner), `codeql.yml` runs CodeQL, and `build-apk.yml` builds Android APKs on demand via EAS. Nothing to configure locally beyond `npm run check`.

## Conventions

Nothing strict — these just keep things consistent, and a couple are enforced by lint:

- **Types:** strict TypeScript, please — avoid `any`, import shared types from `web/shared/schemas` instead of redefining them.
- **Comments:** explain the _why_ not _what_ (except for notes/JsDocs)
- **Network and processes:** route outbound calls through the existing helpers — `no-raw-fetch` / `no-raw-spawn` will flag it otherwise.
- `npm run check` at the repo root before a PR catches most of the above.

## Commits and PRs

- A pre-commit hook (husky + lint-staged, set up by `npm install` at the repo root) auto-lints your staged files on `git commit` — fix what it flags, or use `git commit --no-verify` to bypass in a pinch.
- Lowercase, no hype, with a prefix: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `style:`, `ci:`.
- Please open a PR rather than pushing to `main` — a short note on what changed and how you tested it is plenty.
- Just don't commit secrets (`.env` and cookie files are already in `.gitignore`).

## Found a Bug, or Have an Idea?

The issue templates make it quick — bugs, features, and "this site stopped working" each have a form. Security issues are the one exception: please report those privately via [`SECURITY.md`](SECURITY.md) rather than a public issue.

Thanks again — truly.
