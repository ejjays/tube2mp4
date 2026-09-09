/**
 * benchmark /convert endpoint performance
 *
 * usage:
 * node scripts/bench-convert.js [URL]
 *
 * envs:
 * BENCH_HOST: target server
 * BENCH_URL: fallback URL
 * BENCH_FORMAT: mp4|m4a|mp3
 * BENCH_TIMEOUT_MS: request timeout
 */

import { request as httpRequest } from 'node:http';
import { URL } from 'node:url';

const MB = 1024 * 1024;

const HOST = process.env.BENCH_HOST || 'http://localhost:5000';
const URL_ARG =
  process.argv[2] ||
  process.env.BENCH_URL ||
  'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const FORMAT = process.env.BENCH_FORMAT || 'mp4';
const TIMEOUT_MS = parseInt(process.env.BENCH_TIMEOUT_MS || '180000', 10);
const CLIENT_ID = `bench_${Date.now().toString(36)}`;

async function resolveFormats(target, urlArg, clientId) {
  const infoUrl = `${target.origin}/info?url=${encodeURIComponent(urlArg)}&id=${clientId}`;
  const startedAt = Date.now();
  const maxWaitMs = 30_000;
  let attempt = 0;
  let lastBody = null;

  while (Date.now() - startedAt < maxWaitMs) {
    attempt += 1;
    const callStart = Date.now();
    const info = await fetchJson(infoUrl);
    console.log(
      `[bench] /info attempt ${attempt} status=${info.status} (${Date.now() - callStart}ms)`
    );

    if (info.status !== 200) {
      throw new Error(
        `/info failed: status=${info.status} body=${JSON.stringify(info.body).slice(0, 200)}`
      );
    }

    lastBody = info.body;
    const audioFormats = info.body.audioFormats || [];
    const videoFormats = info.body.formats || [];
    const totalFormats = audioFormats.length + videoFormats.length;

    if (totalFormats > 0) {
      console.log(
        `[bench] formats ready after ${Date.now() - startedAt}ms (audio=${audioFormats.length}, video=${videoFormats.length}, isPartial=${Boolean(info.body.isPartial)})`
      );
      return info.body;
    }

    console.log(
      `[bench] partial: isPartial=${Boolean(info.body.isPartial)}, retrying in 500ms`
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `timed out waiting for formats after ${maxWaitMs}ms; last=${JSON.stringify(lastBody).slice(0, 200)}`
  );
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('info timeout')));
    req.end();
  });
}

function streamDownload(url) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let firstByteAt = 0;
    let lastByteAt = 0;
    let totalBytes = 0;

    const req = httpRequest(url, { method: 'GET' }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`status ${res.statusCode}`));
        return;
      }
      console.log(
        `[bench] response: ${res.statusCode} ${res.headers['content-type']}`
      );
      console.log(
        `[bench] disposition: ${res.headers['content-disposition'] || '(none)'}`
      );

      res.on('data', (chunk) => {
        if (firstByteAt === 0) firstByteAt = Date.now();
        lastByteAt = Date.now();
        totalBytes += chunk.length;
        if (totalBytes % (4 * MB) < chunk.length) {
          process.stdout.write(
            `[bench] progress: ${(totalBytes / MB).toFixed(1)} MB\r`
          );
        }
      });
      res.on('end', () => {
        const totalMs = Math.max(1, Date.now() - t0);
        const ttfbMs = firstByteAt > 0 ? firstByteAt - t0 : -1;
        const streamingMs = Math.max(1, lastByteAt - firstByteAt);
        const wallMbps = totalBytes / MB / (totalMs / 1000);
        const streamMbps = totalBytes / MB / (streamingMs / 1000);

        process.stdout.write('\n');
        resolve({
          totalBytes,
          totalMs,
          ttfbMs,
          streamingMs,
          wallMbps,
          streamMbps,
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () =>
      req.destroy(new Error('download timeout'))
    );
    req.end();
  });
}

async function main() {
  const target = new URL(HOST);
  console.log(`[bench] host: ${target.origin}`);
  console.log(`[bench] url: ${URL_ARG}`);
  console.log(`[bench] format: ${FORMAT}`);

  console.log('[bench] resolving /info (will await prefetch if partial)...');
  const body = await resolveFormats(target, URL_ARG, CLIENT_ID);

  const audioFormats = body.audioFormats || [];
  const videoFormats = body.formats || [];
  const isAudioRequest = ['m4a', 'mp3', 'audio'].includes(FORMAT);

  let pick = process.env.BENCH_FORMAT_ID;
  if (!pick) {
    if (isAudioRequest) {
      pick = audioFormats[0]?.formatId || videoFormats[0]?.formatId;
    } else {
      // prefer 720p mp4 video
      const candidates = videoFormats.filter(
        (fmt) => fmt.height && fmt.height <= 1080 && fmt.height >= 360
      );
      pick =
        candidates.find((fmt) => fmt.height === 720)?.formatId ||
        candidates[0]?.formatId ||
        videoFormats[0]?.formatId ||
        audioFormats[0]?.formatId;
    }
  }

  if (!pick) {
    throw new Error(
      `no format available even after wait (audio=${audioFormats.length}, video=${videoFormats.length})`
    );
  }
  console.log(`[bench] selected formatId=${pick}`);

  const params = new URLSearchParams({
    url: URL_ARG,
    format: FORMAT,
    formatId: String(pick),
    id: CLIENT_ID,
    token: CLIENT_ID,
    title: body.title || 'Bench',
    artist: body.uploader || 'Bench',
  });
  const convertUrl = `${target.origin}/convert?${params.toString()}`;

  console.log('[bench] hitting /convert...');
  const result = await streamDownload(convertUrl);

  console.log('');
  const sizeMB = result.totalBytes / MB;
  console.log(`[bench][/convert] size=${sizeMB.toFixed(2)}MB`);
  console.log(`[bench][/convert] total=${result.totalMs}ms`);
  console.log(`[bench][/convert] TTFB=${result.ttfbMs}ms`);
  console.log(`[bench][/convert] streamingOnly=${result.streamingMs}ms`);
  console.log('');
  console.log(
    `[bench][calc] wall  = ${sizeMB.toFixed(2)}MB / ${(result.totalMs / 1000).toFixed(2)}s = ${result.wallMbps.toFixed(2)} MB/s (${(result.wallMbps * 8).toFixed(1)} Mbps)`
  );
  console.log(
    `[bench][calc] stream= ${sizeMB.toFixed(2)}MB / ${(result.streamingMs / 1000).toFixed(2)}s = ${result.streamMbps.toFixed(2)} MB/s (${(result.streamMbps * 8).toFixed(1)} Mbps)`
  );
}

main().catch((err) => {
  console.error('[bench] failed:', err.message);
  process.exitCode = 1;
});
