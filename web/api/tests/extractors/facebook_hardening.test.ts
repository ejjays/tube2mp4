import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/services/extractors/facebook/parser.js';
import { normalizeVideoInfo } from '../../src/services/extractors/facebook/normalizer.js';

interface ParsedFacebook {
  formats: { url: string; format_id?: string }[];
}

describe('Facebook extractor hardening', () => {
  it('does not pair HD video with audio from a different object', () => {
    const html =
      '[{"video_id":"123","browser_native_hd_url":"https://fb.com/A.mp4"},{"video_id":"456","audioUrl":"https://fb.com/B.mp4"}]';
    const parsed = parseHtml(
      html,
      'https://www.facebook.com/reel/123/'
    ) as ParsedFacebook;
    const urls = parsed.formats.map((format) => format.url);

    expect(urls).toContain('https://fb.com/A.mp4');
    expect(urls).not.toContain('https://fb.com/B.mp4');
  });

  it('still pairs HD video with audio inside the same object', () => {
    const html =
      '{"video_id":"123","browser_native_hd_url":"https://fb.com/V.mp4","audioUrl":"https://fb.com/Au.mp4"}';
    const parsed = parseHtml(
      html,
      'https://www.facebook.com/reel/123/'
    ) as ParsedFacebook;
    const urls = parsed.formats.map((format) => format.url);

    expect(urls).toContain('https://fb.com/V.mp4');
    expect(urls).toContain('https://fb.com/Au.mp4');
  });

  it('assigns a deterministic formatId when source lacks ids', () => {
    const info = normalizeVideoInfo('https://fb.com/reel/1', {
      formats: [{ url: 'https://fb.com/x.mp4', ext: 'mp4' }],
    });
    expect(info?.formats[0].formatId).toBe('fb_0');
  });

  // real 2026 reel: hd+sd, no audiourl
  it('extracts hd and sd progressive muxed urls', () => {
    const html =
      '{"video_id":"816286967401655","browser_native_hd_url":"https://video.fbcdn.net/hd.mp4","browser_native_sd_url":"https://video.fbcdn.net/sd.mp4","dash_manifest_xml_string":"<MPD>...</MPD>"}';
    const parsed = parseHtml(
      html,
      'https://www.facebook.com/reel/816286967401655'
    ) as ParsedFacebook;
    const ids = parsed.formats.map((format) => format.format_id);

    expect(ids).toContain('hd');
    expect(ids).toContain('sd');
  });

  // thumbnail must not hijack video
  it('does not let a photo thumbnail hijack a video reel', () => {
    const html =
      '{"image":{"uri":"https://scontent.fbcdn.net/thumb.jpg"}}{"browser_native_hd_url":"https://video.fbcdn.net/v.mp4"}';
    const parsed = parseHtml(
      html,
      'https://www.facebook.com/reel/123'
    ) as ParsedFacebook;
    const ids = parsed.formats.map((format) => format.format_id);

    expect(ids).toContain('hd');
    expect(ids).not.toContain('photo');
  });
});
