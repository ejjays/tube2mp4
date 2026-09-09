import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '../../src/utils/media/video.util.js';

describe('URL Normalization (Cache Consistency)', () => {
  it('should strip Spotify tracking parameters (si, context)', () => {
    const url1 =
      'https://open.spotify.com/track/7BjcYqD0CqXnG45ezWSTYR?si=li0Q9bFpSOO2W6AJVSfVQw&context=playlist';
    const url2 =
      'https://open.spotify.com/track/7BjcYqD0CqXnG45ezWSTYR?si=different_id';
    const expected = 'https://open.spotify.com/track/7BjcYqD0CqXnG45ezWSTYR';

    expect(normalizeUrl(url1)).toBe(expected);
    expect(normalizeUrl(url2)).toBe(expected);
  });

  it('should strip Facebook and TikTok tracking parameters', () => {
    const fbUrl = 'https://www.facebook.com/watch/?v=123&rdid=abc&fbclid=xyz';
    const tiktokUrl = 'https://www.tiktok.com/@user/video/123?utm_source=copy';

    expect(normalizeUrl(fbUrl)).toContain('v=123');
    expect(normalizeUrl(fbUrl)).not.toContain('fbclid');
    expect(normalizeUrl(tiktokUrl)).not.toContain('utm_source');
  });

  it('should handle URLs without parameters gracefully', () => {
    const cleanUrl = 'https://www.youtube.com/watch?v=N2pFAltZSGs';
    expect(normalizeUrl(cleanUrl)).toBe(cleanUrl);
  });
});
