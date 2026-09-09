import { describe, it, expect } from 'vitest';
import { nativePlatform } from '../../src/services/ytdlp/info.js';

/**
 * Drives the Sentry degradation signal: only native-extractor platforms
 * should alert when they fall back to yt-dlp. Generic platforms use yt-dlp
 * normally and must NOT be flagged (avoids noise).
 */
describe('nativePlatform — degradation signal targeting', () => {
  it('flags native-extractor platforms', () => {
    expect(nativePlatform('https://www.facebook.com/reel/123')).toBe(
      'Facebook'
    );
    expect(nativePlatform('https://youtu.be/abc')).toBe('YouTube');
    expect(nativePlatform('https://www.tiktok.com/@x/video/1')).toBe('TikTok');
    expect(nativePlatform('https://www.instagram.com/reel/x')).toBe(
      'Instagram'
    );
    expect(nativePlatform('https://soundcloud.com/x/y')).toBe('SoundCloud');
  });

  it('does not flag platforms where yt-dlp is the normal path', () => {
    expect(nativePlatform('https://vimeo.com/123')).toBeNull();
    expect(nativePlatform('https://www.bilibili.com/video/x')).toBeNull();
  });
});
