import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getInfo } from '../../src/services/extractors/facebook/index.js';
import { VideoInfo } from '../../src/types/index.js';

describe('Facebook Stories Extractor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect story URLs and extract video metadata from JSON', async () => {
    const storyUrl = 'https://www.facebook.com/stories/12345/67890/';

    const mockHtml = `
      <html>
        <body>
          <script>
            var x = {
              "unified_video_url":"https:\\/\\/video.fb.com\\/v\\/story_hd.mp4?_nc_cat=101",
              "playable_url":"https:\\/\\/video.fb.com\\/v\\/story_sd.mp4?_nc_cat=102",
              "story_bucket_owner_name":"Test User",
              "preferred_thumbnail":{"image":{"uri":"https:\\/\\/scontent.fb.com\\/thumb.jpg"}}
            };
          </script>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation((_url: string) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        url: storyUrl,
        text: () => Promise.resolve(mockHtml),
        headers: { get: () => null },
      } as unknown as Response);
    });

    const info = (await getInfo(storyUrl)) as VideoInfo;

    expect(info).not.toBeNull();
    expect(info.uploader).toBe('Test User');
    expect(info.formats.length).toBeGreaterThanOrEqual(1);

    const hdFormat = info.formats.find((format) => format.formatId === 'hd');
    expect(hdFormat).toBeDefined();
    expect(hdFormat?.url).toContain('story_hd.mp4');
  });

  it('should fallback gracefully when metadata is missing', async () => {
    const storyUrl = 'https://www.facebook.com/stories/123/';
    const mockHtml =
      '<html><body><script>var x = {"playable_url":"https:\\/\\/fb.com\\/v.mp4"};</script></body></html>';

    global.fetch = vi.fn().mockImplementation((_url: string) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        url: storyUrl,
        text: () => Promise.resolve(mockHtml),
        headers: { get: () => null },
      } as unknown as Response);
    });

    const info = (await getInfo(storyUrl)) as VideoInfo;
    expect(info).not.toBeNull();
    expect(info.uploader).toBe('Facebook User');
    expect(info.formats[0].url).toBe('https://fb.com/v.mp4');
  });

  it('should extract photo from an image-only story', async () => {
    const storyUrl = 'https://www.facebook.com/stories/photo123/';
    const mockHtml = `
      <html><body><script>
        var data = {
          "media":{"__typename":"Photo","image":{"uri":"https:\\/\\/scontent.fb.com\\/photo.jpg"}},
          "story_bucket_owner":{"name":"Photo Creator"}
        };
      </script></body></html>
    `;

    global.fetch = vi.fn().mockImplementation((_url: string) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        url: storyUrl,
        text: () => Promise.resolve(mockHtml),
        headers: { get: () => null },
      } as unknown as Response);
    });

    const info = (await getInfo(storyUrl)) as VideoInfo;
    expect(info).not.toBeNull();
    expect(info.uploader).toBe('Photo Creator');
    expect(info.formats[0].formatId).toBe('photo');
    expect(info.formats[0].resolution).toBe('Photo');
  });
});
