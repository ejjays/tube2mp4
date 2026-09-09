import { describe, it, expect } from 'vitest';
import { getProxyHeaders } from '../../src/utils/network/proxy.util.js';

describe('getProxyHeaders — cdn auth headers', () => {
  it('forces the tiktok referer/origin and strips the frontend referer', () => {
    const headers = getProxyHeaders(
      'https://v16-webapp-prime.tiktok.com/video/tos/x.mp4?signature=abc',
      {
        referer: 'https://nex-stream.pages.dev/',
        origin: 'https://nex-stream.pages.dev',
        cookie: 'frontend_session=abc',
        'sec-fetch-site': 'cross-site',
        range: 'bytes=0-',
      }
    );

    expect(headers.referer).toBe('https://www.tiktok.com/');
    expect(headers.origin).toBe('https://www.tiktok.com');
    expect(headers.range).toBe('bytes=0-');
    // frontend identity must not leak
    expect(headers.cookie).toBeUndefined();
    expect(headers['sec-fetch-site']).toBeUndefined();
  });

  it('keeps youtube referer/origin and defaults a range', () => {
    const headers = getProxyHeaders(
      'https://rr5---sn-x.googlevideo.com/videoplayback?test',
      {}
    );
    expect(headers.referer).toBe('https://www.youtube.com/');
    expect(headers.origin).toBe('https://www.youtube.com');
    expect(headers.range).toBe('bytes=0-');
  });

  it('sets the facebook referer for fbcdn hosts', () => {
    const headers = getProxyHeaders('https://video.fmnl.fbcdn.net/v/x.mp4', {
      referer: 'https://nex-stream.pages.dev/',
    });
    expect(headers.referer).toBe('https://www.facebook.com/');
  });
});
