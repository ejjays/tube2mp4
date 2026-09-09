// download-only worker: streams to disk
const STREAMS = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'download' || !data.stream) return;
  STREAMS.set(data.id, {
    stream: data.stream,
    filename: data.filename || 'download',
    mimeType: data.mimeType || 'application/octet-stream',
  });
  event.ports?.[0]?.postMessage({ type: 'ready' });
});

self.addEventListener('fetch', (event) => {
  const match = /^\/__download__\/([^/?#]+)/.exec(
    new URL(event.request.url).pathname
  );
  if (!match) return; // ignore everything except download requests
  const entry = STREAMS.get(match[1]);
  if (!entry) {
    event.respondWith(new Response('gone', { status: 404 }));
    return;
  }
  STREAMS.delete(match[1]);
  const headers = new Headers({
    'Content-Type': entry.mimeType,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(entry.filename)}`,
    'Content-Security-Policy': "default-src 'none'",
    'X-Content-Type-Options': 'nosniff',
  });
  event.respondWith(new Response(entry.stream, { headers }));
});
