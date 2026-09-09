import { describe, it, expect } from 'vitest';
import { extractFromJson } from '../../src/services/extractors/facebook/json-extractor.js';

const jsonHtml = (obj: unknown) =>
  `<html><body><script type="application/json" data-sjs>${JSON.stringify(obj)}</script></body></html>`;

describe('facebook json-extractor (robust path)', () => {
  it('deep-finds muxed hd/sd urls and meta from embedded json', () => {
    const html = jsonHtml({
      require: [
        [
          {
            video: {
              browser_native_hd_url: 'https://video.fbcdn.net/hd.mp4',
              browser_native_sd_url: 'https://video.fbcdn.net/sd.mp4',
            },
            owner: { name: 'Test Page' },
            message: { text: 'My FB Video' },
            preferred_thumbnail: {
              image: { uri: 'https://scontent/thumb.jpg' },
            },
          },
        ],
      ],
    });
    const result = extractFromJson(html);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.formats.map((format) => format.format_id).sort()).toEqual([
      'hd',
      'sd',
    ]);
    expect(
      result.formats.every((format) => format.url.startsWith('http'))
    ).toBe(true);
    expect(result.title).toBe('My FB Video');
    expect(result.uploader).toBe('Test Page');
    expect(result.thumbnail).toContain('thumb.jpg');
  });

  it('falls back (null) when json blocks lack video fields', () => {
    const html =
      '<html><body><script>{"foo":"bar"} {"playable":"x"}</script></body></html>';
    expect(extractFromJson(html)).toBeNull();
  });

  it('uses playable_url fields when browser_native absent', () => {
    const html = jsonHtml({
      data: {
        playable_url_quality_hd: 'https://v/hdq.mp4',
        playable_url: 'https://v/pl.mp4',
      },
    });
    const result = extractFromJson(html);
    expect(
      result?.formats.find((fmt) => fmt.format_id === 'hd')?.url
    ).toContain('hdq.mp4');
    expect(
      result?.formats.find((fmt) => fmt.format_id === 'sd')?.url
    ).toContain('pl.mp4');
  });
});
