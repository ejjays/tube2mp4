import { describe, it, expect, vi } from 'vitest';
import { getVideoInfo } from '../../src/services/ytdlp/info.js';
import { VideoInfo } from '../../src/types/index.js';

// mock extractor
vi.mock('../../src/services/extractors/youtube/index.js', () => ({
  getInfo: vi.fn().mockResolvedValue({
    id: 'nTbA7qrEsP0',
    title: 'Test Video',
    uploader: 'Test Uploader',
    webpageUrl: 'https://www.youtube.com/watch?v=nTbA7qrEsP0',
    duration: 300,
    formats: [
      {
        itag: 18,
        url: 'https://ex.com/18',
        resolution: '360p',
        height: 360,
        vcodec: 'avc1',
        ext: 'mp4',
      },
      {
        itag: 136,
        url: 'https://ex.com/136',
        resolution: '720p',
        height: 720,
        vcodec: 'avc1',
        ext: 'mp4',
      },
      {
        itag: 137,
        url: 'https://ex.com/137',
        resolution: '1080p',
        height: 1080,
        vcodec: 'avc1',
        ext: 'mp4',
      },
    ],
  }),
  getStream: vi.fn(),
  extractId: vi.fn().mockReturnValue('nTbA7qrEsP0'),
}));

describe('Resolution Persistence Test', () => {
  it('should return processed HD formats through the fast-path', async () => {
    // get video info
    const info = (await getVideoInfo(
      'https://www.youtube.com/watch?v=nTbA7qrEsP0'
    )) as VideoInfo;

    expect(info.formats).toBeDefined();
    expect(info.formats.length).toBeGreaterThan(0);

    // cache hit
    const topQuality = info.formats[0].quality;
    if (topQuality) {
      const height = parseInt(topQuality);
      expect(height).toBeGreaterThanOrEqual(1080);
    }
  });
});
