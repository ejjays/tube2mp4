// stream a file straight to disk
let workerPromise: Promise<ServiceWorker> | null = null;

function ensureWorker(): Promise<ServiceWorker> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}download-sw.js`,
      { scope: import.meta.env.BASE_URL }
    );
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) {
      return navigator.serviceWorker.controller;
    }
    return new Promise<ServiceWorker>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('sw control timeout')),
        4000
      );
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          const ctrl = navigator.serviceWorker.controller;
          if (ctrl) {
            clearTimeout(timer);
            resolve(ctrl);
          }
        },
        { once: true }
      );
    });
  })();
  return workerPromise;
}

export function streamSaverSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof ReadableStream !== 'undefined' &&
    typeof MessageChannel !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    !('ReactNativeWebView' in window)
  );
}

async function pipeToWorker(
  body: ReadableStream<Uint8Array>,
  filename: string,
  mimeType: string
): Promise<void> {
  const worker = await ensureWorker();

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const channel = new MessageChannel();
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('sw stream timeout')),
      4000
    );
    channel.port1.onmessage = (event) => {
      if (event.data?.type === 'ready') {
        clearTimeout(timer);
        resolve();
      }
    };
  });

  // transfer the stream to the worker
  worker.postMessage(
    { type: 'download', id, filename, mimeType, stream: body },
    [body as unknown as Transferable, channel.port2]
  );
  await ready;

  // trigger the native download dialog
  const iframe = document.createElement('iframe');
  iframe.hidden = true;
  iframe.src = `/__download__/${id}`;
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 120000);
}

export async function streamToDisk(
  sourceUrl: string,
  filename: string,
  mimeType: string,
  signal: AbortSignal
): Promise<void> {
  const resp = await fetch(sourceUrl, { signal });
  if (!resp.ok || !resp.body) {
    throw new Error(`source fetch failed: ${resp.status}`);
  }
  await pipeToWorker(resp.body, filename, mimeType);
}

// avoids buffering the blob in RAM
export async function streamBlobToDisk(
  blob: Blob,
  filename: string,
  mimeType: string
): Promise<void> {
  await pipeToWorker(
    blob.stream() as unknown as ReadableStream<Uint8Array>,
    filename,
    mimeType
  );
}
