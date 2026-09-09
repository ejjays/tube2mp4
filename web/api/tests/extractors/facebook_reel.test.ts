import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getInfo } from '../../src/services/extractors/facebook/index.js';
import { VideoInfo, ExtractorOptions } from '../../src/types/index.js';

describe('Facebook Reel JS Extractor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should extract metadata from a Reel URL with mocked HTML', async () => {
    const reelUrl = 'https://www.facebook.com/reel/980670334391314/';

    const mockHtml = `
      <html>
        <head>
          <meta property="og:title" content="Facebook">
          <meta property="og:description" content="Cool Reel Content #trending">
          <meta property="og:image" content="https://fb.com/thumb.jpg">
        </head>
        <body>
          <script>
            {"owner":{"__typename":"User","name":"Actual Creator"}}
            {"message":{"text":"Cool Reel Content #trending"}}
            {"video_id":"980670334391314","playable_url_quality_hd":"https://fb.com/video_hd.mp4"}
            {"video_id":"980670334391314","playable_url":"https://fb.com/video_sd.mp4"}
          </script>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (/\bfacebook\.com\b/u.test(url)) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockHtml),
          headers: { get: () => 'text/html' },
          url: reelUrl,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'content-length') return '1000000';
            return null;
          },
        },
      } as Response);
    });

    const options: ExtractorOptions = { cookie: 'mock' };
    const info = (await getInfo(reelUrl, options)) as VideoInfo;

    expect(info).not.toBeNull();
    expect(info.title).toBe('Cool Reel Content');
    expect(info.uploader).toBe('Actual Creator');
    expect(info.formats.length).toBeGreaterThan(0);
    expect(info.formats.some((format) => format.formatId === 'hd')).toBe(true);
  });

  it('should filter out DASH segments and audio-only streams', async () => {
    const reelUrl = 'https://www.facebook.com/reel/123/';
    const mockHtml = `
      <html>
        <body>
          <script>
            {"video_id":"123","browser_native_hd_url":"https://fb.com/video.mp4","audioUrl":"https://fb.com/audio.mp4"}
            {"video_id":"123","browser_native_hd_url":"https://fb.com/fragment_1.mp4","audioUrl":"https://fb.com/audio2.mp4"}
          </script>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockHtml),
        headers: {
          get: (name: string) => {
            if (name === 'content-length') return '1000000';
            if (name === 'content-type') return 'text/html';
            return null;
          },
        },
        url: reelUrl,
      } as Response)
    );

    const info = (await getInfo(reelUrl)) as VideoInfo;

    expect(info.formats.length).toBeGreaterThanOrEqual(1);
    expect(
      info.formats.some((format) => format.url === 'https://fb.com/video.mp4')
    ).toBe(true);
  });

  it('should isolate correct video in preloaded feed and extract split streams', async () => {
    const reelUrl = 'https://www.facebook.com/reel/TARGET_ID/';

    const mockHtml = `
      <html>
        <body>
          <script>
            // target video
            {"video_id":"TARGET_ID","browser_native_hd_url":"https://fb.com/target_video.mp4","audioUrl":"https://fb.com/target_audio.mp4"}
          </script>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockHtml),
        headers: {
          get: (name: string): string | null => {
            if (name === 'content-length') return '1000000';
            return null;
          },
        },
        url: reelUrl,
      } as unknown as Response)
    );

    const info = await getInfo(reelUrl);

    expect(info).not.toBeNull();
    if (info) {
      expect(info.formats.length).toBeGreaterThan(0);
      expect(info.formats[0].url).toBe('https://fb.com/target_video.mp4');
    }
  });

  it('should correctly categorize split DASH components', async () => {
    const reelUrl = 'https://www.facebook.com/reel/123/';
    const mockHtml = `
      <html>
        <body>
          <script>
            {"video_id":"123","browser_native_hd_url":"https://fb.com/video_only.mp4","audioUrl":"https://fb.com/audio_only.m4a"}
          </script>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockHtml),
        headers: {
          get: (name: string) => {
            if (name === 'content-length') return '1000000';
            return null;
          },
        },
        url: reelUrl,
      } as Response)
    );

    const info = (await getInfo(reelUrl)) as VideoInfo;

    expect(info.formats.length).toBeGreaterThan(0);
    const hasVideo = info.formats.some((format) =>
      format.url.includes('video_only')
    );
    const hasAudio = info.formats.some((format) =>
      format.url.includes('audio_only')
    );

    expect(hasVideo).toBe(true);
    expect(hasAudio).toBe(true);
  });

  it('should ignore unrelated formats in the same script block', async () => {
    const reelUrl = 'https://www.facebook.com/reel/TARGET_ID/';
    const mockHtml = `
      <html>
        <body>
          <script>
            [
              {"video_id":"WRONG_ID","browser_native_hd_url":"https://fb.com/wrong_video.mp4","audioUrl":"https://fb.com/wrong_audio.mp4"},
              {"video_id":"TARGET_ID","browser_native_hd_url":"https://fb.com/target_video.mp4","audioUrl":"https://fb.com/target_audio.mp4"}
            ]
          </script>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockHtml),
        headers: {
          get: (name: string) => {
            if (name === 'content-length') return '1000000';
            return null;
          },
        },
        url: reelUrl,
      } as Response)
    );

    const info = (await getInfo(reelUrl)) as VideoInfo;

    expect(
      info.formats.some((format) => format.url.includes('target_video.mp4'))
    ).toBe(true);
  });
});
