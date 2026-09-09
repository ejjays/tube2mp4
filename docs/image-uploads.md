# Comment Image Uploads

Users can attach an image to a comment in the Updates tab. The file never touches a server — the app compresses it on-device, uploads straight to **Cloudflare R2**, and stores a public URL in `comments.image_url`. Images are served back through a small **Cloudflare Pages Function**, not R2's public `r2.dev` URL.

## Flow

```
pick image (gallery)          expo-image-picker
       │
compress on-device            src/lib/social/commentImage.ts
       │  ffmpeg → webp, longest edge capped at 1080, q80 (~10x smaller)
       ▼
ask for presigned PUT         supabase fn: r2-upload-url (10 min TTL, rejects anon)
       │
       ▼
PUT bytes → R2                react-native-blob-util, streamed from disk (no RAM buffer)
       │
       ▼
store publicUrl               comments.image_url = https://c-phantom.pages.dev/i/comments/<uid>/<uuid>.webp
```

The temp webp is deleted in a `finally` block even if upload fails — no cache leftovers. On failure the composer rolls back the optimistic comment and restores your text + pending image.

## Why a Pages Function, Not r2.dev

R2 will hand you a `pub-*.r2.dev` public URL, but Cloudflare's own docs say it's **not for production and has a variable rate limit** — under real traffic it starts returning 429s and images flicker blank. Instead the bucket stays **private**, and a Pages Function bound to it serves bytes from our own `c-phantom.pages.dev` domain:

- No rate limit — it's our Worker, not r2.dev
- R2 egress is free, so image bandwidth never touches Supabase's ~10 GB/month
- Cloudflare edge-caches each image (keys are immutable), so R2 is barely hit
- No custom domain to buy

The function lives in the app at [`web/app/functions/i/[[path]].ts`](../web/app/functions/i/[[path]].ts). It only serves `comments/*.webp` keys, so it can't probe the rest of the bucket.

## Setup

### R2 Bucket + Token

1. R2 → create a bucket (`phantom-uploads`), Standard class. **Keep it private** — no public access needed.
2. R2 → Manage API Tokens → create an **Account API Token** with Object Read & Write, scoped to that bucket. Copy the Access Key ID + Secret (secret shown once).

### Upload Function (Supabase)

Deploy `r2-upload-url` (dashboard editor or `supabase functions deploy r2-upload-url`) with **Verify JWT off** — it authenticates the caller in-code and rejects anonymous sessions. Set five secrets:

```
R2_ACCOUNT_ID          your Cloudflare account id
R2_BUCKET              phantom-uploads
R2_ACCESS_KEY_ID       from the API token
R2_SECRET_ACCESS_KEY   from the API token
R2_PUBLIC_BASE         https://c-phantom.pages.dev/i
```

### Serving Function (Cloudflare Pages)

1. Cloudflare → your Pages project → Settings → Functions → **R2 bindings** → add binding: variable name `UPLOADS` → bucket `phantom-uploads`.
2. The function file (`functions/i/[[path]].ts`) is already in the app; the next Pages deploy picks it up. It serves `https://c-phantom.pages.dev/i/comments/...`.

### Delete Function (Cloudflare Pages + Supabase Webhook)

When a comment (or its row's parent via cascade) is deleted, a Supabase database webhook posts to another Pages Function that drops the R2 object. Catches direct deletes and cascades (profile → comments), so nothing orphans in R2.

1. Cloudflare → the Pages project → Settings → Variables and Secrets → add a **secret** `WEBHOOK_SECRET` (any long random string — `openssl rand -hex 32`). The `UPLOADS` R2 binding from the serving function is reused, no changes needed.
2. The function file (`functions/comment-deleted.ts`) is already in the app; the next Pages deploy picks it up. Its route is `https://c-phantom.pages.dev/comment-deleted`.
3. Supabase → Database → **Webhooks** → Create a webhook:
   - Name: `r2-comment-cleanup`
   - Table: `public.comments`, Event: **Delete**
   - Type: **HTTP Request**, Method: **POST**
   - URL: `https://c-phantom.pages.dev/comment-deleted`
   - HTTP Headers: add `X-Webhook-Secret` with the same value from step 1

Verify by deleting a test comment that has an image — the row goes, the R2 object goes with it. Wrong-event or bad-key payloads still return 200 so Supabase doesn't retry pointlessly.

## Migrating Existing URLs

If any images were already stored against the old `r2.dev` base, rewrite them once in the SQL Editor. This rebuilds each URL from the `comments/…` key, so you don't need to paste the old base:

```sql
update public.comments
set image_url = 'https://c-phantom.pages.dev/i/' ||
                substring(image_url from 'comments/.*$')
where image_url is not null
  and image_url like '%/comments/%'
  and image_url not like 'https://c-phantom.pages.dev/i/%';
```

## Notes

- Images are immutable (keyed by random uuid), so they're cached `max-age=31536000, immutable` — an edit uploads a new object rather than overwriting.
- Deleting a comment triggers a Supabase database webhook that hits [`comment-deleted`](../web/app/functions/comment-deleted.ts), which parses the row's `image_url` & drops the R2 object. Cascades (profile → comments) fire the webhook too, so orphans don't accumulate.
- The R2 secret keys live only in the `r2-upload-url` function secrets — never in the app.
