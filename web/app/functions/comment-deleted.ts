interface Env {
  UPLOADS: R2Bucket;
  WEBHOOK_SECRET: string;
}

type WebhookPayload = {
  type?: string;
  old_record?: { image_url?: string | null } | null;
}; 

/*
 * r2 cleanup for deleted comments. supabase database webhook (comments DELETE)
 * posts here; we parse the old_record.image_url, extract the object key & delete.
 *
 * shared-secret gated so only supabase can call it. runs on cascades too (profile
 * delete -> comments delete), catching every path a row could vanish through.
 * idempotent: R2 .delete on a missing key is a no-op.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const secret = request.headers.get('x-webhook-secret');
  if (!env.WEBHOOK_SECRET || secret !== env.WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  let payload: WebhookPayload;
  try {
    payload = (await request.json()) as WebhookPayload;
  } catch {
    return new Response('bad payload', { status: 400 });
  }

  if (payload.type !== 'DELETE') {
    // wrong-event no-op; still 200 so supabase doesn't retry
    return new Response('ignored', { status: 200 });
  }

  const url = payload.old_record?.image_url;
  if (!url) return new Response('no image', { status: 200 });

  // strip client-side aspect fragment (#ar=...) then pull the /i/<key>
  const path = url.split('#')[0].split('/i/')[1];
  // lock namespace to comments/*.webp (defence in depth, mirrors GET function)
  if (!path || !path.startsWith('comments/') || !path.endsWith('.webp')) {
    return new Response('bad key', { status: 400 });
  }

  await env.UPLOADS.delete(path);
  return new Response('deleted', { status: 200 });
};
