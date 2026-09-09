import { describe, it, expect, vi } from 'vitest';

/**
 * Regression: m4a vanished from the Spotify picker. JS/yt-dlp normalizers
 * split audio-only streams into info.audioFormats and leave info.formats
 * video-only. prepareFinalResponse recomputed audioFormats from the
 * video-only list -> []. real m4a (itag 140) must survive.
 */
vi.mock('../../src/services/social.service.js', () => ({
  normalizeTitle: (i: { title?: string }) => i.title ?? 'Unknown',
  normalizeArtist: (i: { artist?: string }) => i.artist ?? 'Unknown',
  getBestThumbnail: () => '/logo.webp',
  proxyThumbnailIfNeeded: () => Promise.resolve('/logo.webp'),
}));

import { prepareFinalResponse } from '../../src/utils/api/response.util.js';

const info = {
  id: 'vid1',
  title: 'Nobody Gets Me',
  artist: 'SZA',
  uploader: 'SZA',
  duration: 200,
  formats: [
    {
      formatId: '137',
      extension: 'mp4',
      url: 'https://r.example.com/v.mp4',
      isVideo: true,
      isAudio: false,
      height: 1080,
      resolution: '1080p',
    },
  ],
  audioFormats: [
    {
      formatId: '140',
      extension: 'm4a',
      url: 'https://r.example.com/a.m4a',
      isVideo: false,
      isAudio: true,
      quality: '128kbps',
    },
  ],
  isPartial: false,
} as never;

describe('prepareFinalResponse — audioFormats preservation', () => {
  it('keeps real m4a audio split out by the normalizer', async () => {
    const res = await prepareFinalResponse(
      info,
      false,
      null,
      'https://www.youtube.com/watch?v=vid1'
    );
    expect(res.audioFormats).toHaveLength(1);
    expect(res.audioFormats[0].formatId).toBe('140');
    expect(res.audioFormats[0].extension).toBe('m4a');
  });
});
