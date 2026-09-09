import { describe, it, expect } from 'vitest';
import { extractFromJson } from '../../src/services/extractors/threads/json-extractor.js';

const jsonHtml = (obj: unknown) =>
  `<html><body><script type="application/json" data-sjs>${JSON.stringify(obj)}</script></body></html>`;

describe('threads json-extractor (media walk)', () => {
  it('picks the highest-resolution video_versions entry plus meta', () => {
    const html = jsonHtml({
      code: 'ABC123',
      caption: { text: 'my threads clip #cool' },
      user: { username: 'tester', full_name: 'Test User' },
      image_versions2: {
        candidates: [
          {
            width: 320,
            height: 568,
            url: 'https://scontent.cdninstagram.com/lo.jpg',
          },
          {
            width: 1080,
            height: 1920,
            url: 'https://scontent.cdninstagram.com/hi.jpg',
          },
        ],
      },
      video_versions: [
        {
          type: 101,
          width: 720,
          height: 1280,
          url: 'https://scontent.cdninstagram.com/720.mp4',
        },
        {
          type: 102,
          width: 1080,
          height: 1920,
          url: 'https://scontent.cdninstagram.com/1080.mp4',
        },
      ],
    });

    const result = extractFromJson(html);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.formats).toHaveLength(1);
    expect(result.formats[0]).toMatchObject({
      format_id: 'hd',
      url: 'https://scontent.cdninstagram.com/1080.mp4',
      width: 1080,
      height: 1920,
    });
    expect(result.title).toBe('my threads clip #cool');
    expect(result.uploader).toBe('Test User');
    expect(result.thumbnail).toBe('https://scontent.cdninstagram.com/hi.jpg');
  });

  it('falls back to playable_url fields (with co-located dims) when video_versions absent', () => {
    const html = jsonHtml({
      playable_url_quality_hd: 'https://video.cdninstagram.com/hd.mp4',
      playable_url: 'https://video.cdninstagram.com/sd.mp4',
      original_width: 720,
      original_height: 1280,
      user: { username: 'creator' },
    });
    const result = extractFromJson(html);
    const hd = result?.formats.find((format) => format.format_id === 'hd');
    expect(hd?.url).toContain('hd.mp4');
    expect(hd?.width).toBe(720);
    expect(hd?.height).toBe(1280);
    expect(
      result?.formats.find((format) => format.format_id === 'sd')?.url
    ).toContain('sd.mp4');
    expect(result?.uploader).toBe('creator');
  });

  it('emits photo formats for an image-only post', () => {
    const html = jsonHtml({
      caption: { text: 'a photo' },
      user: { full_name: 'Shooter' },
      image_versions2: {
        candidates: [
          {
            width: 1080,
            height: 1080,
            url: 'https://scontent.cdninstagram.com/p.jpg',
          },
        ],
      },
    });
    const result = extractFromJson(html);
    expect(result?.formats).toHaveLength(1);
    expect(result?.formats[0]).toMatchObject({
      format_id: 'photo',
      ext: 'jpeg',
      url: 'https://scontent.cdninstagram.com/p.jpg',
    });
  });

  it('captures an fb-style poster when image_versions2 is absent', () => {
    const html = jsonHtml({
      browser_native_hd_url: 'https://video.cdninstagram.com/v.mp4',
      original_width: 1080,
      original_height: 1920,
      preferred_thumbnail: {
        image: { uri: 'https://scontent.cdninstagram.com/poster.jpg' },
      },
      user: { full_name: 'Poster User' },
    });
    const result = extractFromJson(html);
    expect(result?.formats[0]).toMatchObject({
      format_id: 'hd',
      width: 1080,
      height: 1920,
    });
    expect(result?.thumbnail).toBe(
      'https://scontent.cdninstagram.com/poster.jpg'
    );
  });

  it('returns null for a walled shell with no media keys', () => {
    expect(
      extractFromJson(jsonHtml({ foo: 'bar', locale: 'en_US' }))
    ).toBeNull();
  });

  it('ignores unparseable json blocks', () => {
    const html = '<script type="application/json">{not valid json}</script>';
    expect(extractFromJson(html)).toBeNull();
  });
});
