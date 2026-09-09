interface Env {
  UPLOADS: R2Bucket;
}

/*
* serves comment images from the R2 bucket (bound as UPLOADS) on our own Pages
* domain, dodging r2.dev's production rate limit. keys are immutable
*/
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const parts = context.params.path;
  const key = Array.isArray(parts) ? parts.join('/') : parts;

  const allowed = ['comments/', 'smileys/'].some((prefix) => key.startsWith(prefix));
  if (!key || !allowed || !key.endsWith('.webp')) {
    return new Response('Not found', { status: 404 });
  }

  const object = await context.env.UPLOADS.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  if (!headers.has('content-type')) headers.set('content-type', 'image/webp');
  return new Response(object.body, { headers });
};
