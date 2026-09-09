import { describe, it, expect, vi } from 'vitest';

// keep real normalizeTitle/normalizeArtist; stub only thumbnail network
vi.mock('../../src/services/social.service.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/services/social.service.js')
    >();
  return {
    ...actual,
    getBestThumbnail: () => '/logo.webp',
    proxyThumbnailIfNeeded: () => Promise.resolve('/logo.webp'),
  };
});

import { prepareFinalResponse } from '../../src/utils/api/response.util.js';

const fbInfo = {
  id: '1005507585198795',
  title: 'Facebook Video',
  uploader: 'GMA News',
  formats: [
    {
      formatId: 'hd',
      url: 'https://video.fbcdn.net/v.mp4',
      extension: 'mp4',
      isVideo: true,
      isAudio: true,
    },
  ],
  metascraper: {
    title:
      '6.2M views · 38K reactions | breaking news clip | GMA News | Facebook',
    author: 'GMA News',
  },
} as never;

describe('prepareFinalResponse — facebook title', () => {
  it('rejects the junk placeholder/engagement title and uses the caption', async () => {
    const res = await prepareFinalResponse(
      fbInfo,
      false,
      null,
      'https://www.facebook.com/reel/1005507585198795'
    );
    expect(res.title).not.toBe('Facebook Video');
    expect(res.title).toBe('breaking news clip');
  });
});
