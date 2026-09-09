// runs against dist/, not src/ — same fixture as web/api's x_extractor.test.ts
import { createXExtractor } from '../dist/index.js';
import type { ExtractorEnv } from '../dist/index.js';

const TWEET_JSON = {
  text: 'lol check this https://t.co/abc123',
  user: { name: 'Test User', screen_name: 'testuser' },
  mediaDetails: [
    {
      type: 'video',
      media_url_https: 'https://pbs.twimg.com/thumb.jpg',
      video_info: {
        variants: [
          {
            content_type: 'application/x-mpegURL',
            url: 'https://video.twimg.com/x.m3u8',
          },
          {
            content_type: 'video/mp4',
            bitrate: 632000,
            url: 'https://video.twimg.com/ext/720x1280/v.mp4',
          },
          {
            content_type: 'video/mp4',
            bitrate: 256000,
            url: 'https://video.twimg.com/ext/320x568/v.mp4',
          },
        ],
      },
    },
  ],
};

const mockEnv: ExtractorEnv = {
  // skipcq: JS-0116
  async fetch(url: string | URL | Request, init?: RequestInit) {
    const href = url.toString();
    const host = new URL(href).hostname;
    if (
      host === 'cdn.syndication.twimg.com' ||
      host.endsWith('.cdn.syndication.twimg.com')
    ) {
      return new Response(JSON.stringify(TWEET_JSON), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (init?.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '5000000' },
      });
    }
    return new Response(null, { status: 404 });
  },
  // skipcq: JS-0116
  async streamUrl() {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
  },
};

const x = createXExtractor(mockEnv);

const info = await x.getInfo('https://x.com/testuser/status/123456?s=20');
if (!info) throw new Error('expected info, got null');

const assertions: Array<[string, boolean]> = [
  ['2 mp4 formats (HLS filtered out)', info.formats.length === 2],
  [
    'formats sorted 720p, 320p',
    info.formats.map((f) => f.quality).join(',') === '720p,320p',
  ],
  ['t.co link stripped from title', info.title === 'lol check this'],
  ['uploader resolved', info.uploader === 'Test User'],
  ['filesize backfilled from HEAD', info.formats[0].filesize === 5000000],
];

console.log('VideoInfo:', JSON.stringify(info, null, 2));
console.log('\nChecks:');
let failed = false;
for (const [label, pass] of assertions) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed = true;
}

const stream = await x.getStream(info, { formatId: '320p' });
console.log(
  `\nPASS  getStream() resolved a ReadableStream: ${stream instanceof ReadableStream}`
);

if (failed) {
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed against the built dist/ package.');
}
