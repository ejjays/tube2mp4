import { describe, it, expect, vi } from 'vitest';

// isolate tier mapping from title/artist heuristics
vi.mock('../../src/services/social.service.js', () => ({
  normalizeTitle: (info: Record<string, unknown>) =>
    typeof info.title === 'string' ? info.title : '',
  normalizeArtist: (info: Record<string, unknown>) =>
    typeof info.uploader === 'string' ? info.uploader : '',
}));

import { normalizeVideoInfo } from '../../src/services/extractors/facebook/normalizer.js';
import type {
  FbParsed,
  FbRawFormat,
} from '../../src/services/extractors/facebook/types.js';

const URL = 'https://www.facebook.com/x/videos/123/';

const parsed = (formats: FbRawFormat[]): FbParsed => ({
  id: '123',
  title: 'My Caption',
  uploader: 'Creator',
  thumbnail: 'https://t/thumb.jpg',
  formats,
});

const tierCases: Array<{
  name: string;
  raw: FbRawFormat;
  expected: Record<string, unknown>;
}> = [
  {
    name: 'hd muxed (json shape with explicit codecs)',
    raw: {
      url: 'https://v/hd.mp4',
      format_id: 'hd',
      ext: 'mp4',
      vcodec: 'h264',
      acodec: 'aac',
    },
    expected: {
      formatId: 'hd',
      extension: 'mp4',
      resolution: 'HD',
      quality: 'HD',
      isVideo: true,
      isAudio: true,
      isMuxed: true,
    },
  },
  {
    name: 'sd from regex (codecs inferred from mp4 ext)',
    raw: { url: 'https://v/sd.mp4', format_id: 'sd', ext: 'mp4' },
    expected: {
      formatId: 'sd',
      extension: 'mp4',
      resolution: 'SD',
      quality: 'SD',
      isVideo: true,
      isAudio: true,
      isMuxed: true,
    },
  },
  {
    name: 'single photo (jpeg, no codecs)',
    raw: { url: 'https://v/p.jpg', format_id: 'photo', ext: 'jpeg' },
    expected: {
      formatId: 'photo',
      extension: 'jpeg',
      resolution: 'Photo',
      quality: 'Photo',
      isVideo: false,
      isAudio: false,
      isMuxed: false,
    },
  },
  {
    name: 'indexed photo keeps Photo tier',
    raw: { url: 'https://v/p0.jpg', format_id: 'photo_0', ext: 'jpeg' },
    expected: {
      formatId: 'photo_0',
      extension: 'jpeg',
      resolution: 'Photo',
      quality: 'Photo',
      isVideo: false,
      isAudio: false,
      isMuxed: false,
    },
  },
];

describe('facebook normalizer — tier mapping', () => {
  it.each(tierCases)('maps $name', ({ raw, expected }) => {
    const info = normalizeVideoInfo(URL, parsed([raw]));
    if (!info) throw new Error('expected video info');
    expect(info.formats[0]).toMatchObject(expected);
  });

  it('maps an audio-only m4a stream (isAudio, not video, no quality tier)', () => {
    const info = normalizeVideoInfo(
      URL,
      parsed([
        {
          url: 'https://v/a.m4a',
          format_id: 'audio',
          ext: 'm4a',
          acodec: 'aac',
        },
      ])
    );
    if (!info) throw new Error('expected video info');
    const audio = info.formats[0];
    expect(audio.formatId).toBe('audio');
    expect(audio.extension).toBe('m4a');
    expect(audio.acodec).toBe('aac');
    expect(audio.vcodec).toBeUndefined();
    expect(audio.isAudio).toBe(true);
    expect(audio.isVideo).toBe(false);
    expect(audio.isMuxed).toBe(false);
    expect(audio.resolution).toBe('Source');
    expect(audio.quality).toBeUndefined();
  });

  it('keeps split hd video and audio as separate formats', () => {
    const info = normalizeVideoInfo(
      URL,
      parsed([
        { url: 'https://v/hd.mp4', format_id: 'hd', ext: 'mp4' },
        {
          url: 'https://v/a.m4a',
          format_id: 'audio',
          ext: 'm4a',
          acodec: 'aac',
        },
      ])
    );
    if (!info) throw new Error('expected video info');
    expect(info.formats).toHaveLength(2);
    expect(info.formats.map((format) => format.formatId)).toEqual([
      'hd',
      'audio',
    ]);
  });
});

describe('facebook normalizer — guards and fallbacks', () => {
  it('returns null for null parsed data', () => {
    expect(normalizeVideoInfo(URL, null)).toBeNull();
  });

  it('returns null when there are no formats', () => {
    expect(normalizeVideoInfo(URL, parsed([]))).toBeNull();
  });

  it('falls back to the page url when id is missing', () => {
    const info = normalizeVideoInfo('https://fb.watch/abc', {
      id: null,
      title: 'T',
      uploader: 'U',
      thumbnail: '',
      formats: [{ url: 'https://v/x.mp4', format_id: 'hd', ext: 'mp4' }],
    });
    expect(info?.id).toBe('https://fb.watch/abc');
  });

  it('assigns a deterministic formatId when format_id is absent', () => {
    const info = normalizeVideoInfo(URL, {
      id: '1',
      title: 'T',
      uploader: 'U',
      thumbnail: '',
      formats: [{ url: 'https://v/x.mp4', ext: 'mp4' }],
    });
    expect(info?.formats[0].formatId).toBe('fb_0');
    expect(info?.formats[0].resolution).toBe('Source');
  });

  it('applies default title/uploader when parsed values are empty', () => {
    const info = normalizeVideoInfo(URL, {
      id: '1',
      title: '',
      uploader: '',
      thumbnail: '',
      formats: [{ url: 'https://v/x.mp4', format_id: 'hd', ext: 'mp4' }],
    });
    expect(info?.title).toBe('Facebook Video');
    expect(info?.uploader).toBe('Facebook User');
  });
});
