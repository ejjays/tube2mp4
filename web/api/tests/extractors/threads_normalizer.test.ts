import { describe, it, expect, vi } from 'vitest';

// isolate mapping from title/artist heuristics
vi.mock('../../src/services/social.service.js', () => ({
  normalizeTitle: (info: Record<string, unknown>) =>
    typeof info.title === 'string' ? info.title : '',
  normalizeArtist: (info: Record<string, unknown>) =>
    typeof info.uploader === 'string' ? info.uploader : '',
}));

import { normalizeVideoInfo } from '../../src/services/extractors/threads/normalizer.js';
import type {
  ThreadsParsed,
  ThreadsRawFormat,
} from '../../src/services/extractors/threads/types.js';

const URL = 'https://www.threads.com/@tester/post/ABC123';

const parsed = (formats: ThreadsRawFormat[]): ThreadsParsed => ({
  id: 'ABC123',
  title: 'caption',
  uploader: 'Test User',
  thumbnail: 'https://scontent.cdninstagram.com/t.jpg',
  formats,
});

describe('threads normalizer — mapping', () => {
  it('maps a sized video to a quality label and muxed flags', () => {
    const info = normalizeVideoInfo(
      URL,
      parsed([
        {
          url: 'https://scontent.cdninstagram.com/1080.mp4',
          format_id: 'hd',
          ext: 'mp4',
          vcodec: 'h264',
          acodec: 'aac',
          width: 1080,
          height: 1920,
        },
      ])
    );
    if (!info) throw new Error('expected video info');
    expect(info.extractorKey).toBe('threads');
    expect(info.thumbnail).toBe('https://scontent.cdninstagram.com/t.jpg');
    expect(info.formats[0]).toMatchObject({
      formatId: 'hd',
      extension: 'mp4',
      resolution: '1080x1920',
      quality: '1920p',
      width: 1080,
      height: 1920,
      isVideo: true,
      isAudio: true,
      isMuxed: true,
    });
  });

  it('labels hd/sd by tier when dimensions are absent', () => {
    const info = normalizeVideoInfo(
      URL,
      parsed([
        {
          url: 'https://scontent.cdninstagram.com/hd.mp4',
          format_id: 'hd',
          ext: 'mp4',
        },
        {
          url: 'https://scontent.cdninstagram.com/sd.mp4',
          format_id: 'sd',
          ext: 'mp4',
        },
      ])
    );
    if (!info) throw new Error('expected video info');
    expect(info.formats[0]).toMatchObject({
      formatId: 'hd',
      quality: 'HD',
      resolution: 'HD',
      isVideo: true,
    });
    expect(info.formats[1]).toMatchObject({
      formatId: 'sd',
      quality: 'SD',
      resolution: 'SD',
    });
  });

  it('maps a photo format with no codecs', () => {
    const info = normalizeVideoInfo(
      URL,
      parsed([
        {
          url: 'https://scontent.cdninstagram.com/p.jpg',
          format_id: 'photo',
          ext: 'jpeg',
        },
      ])
    );
    if (!info) throw new Error('expected video info');
    expect(info.formats[0]).toMatchObject({
      formatId: 'photo',
      extension: 'jpeg',
      resolution: 'Photo',
      quality: 'Photo',
      isVideo: false,
      isAudio: false,
      isMuxed: false,
    });
  });

  it('assigns a deterministic formatId when format_id is absent', () => {
    const info = normalizeVideoInfo(
      URL,
      parsed([{ url: 'https://scontent.cdninstagram.com/x.mp4', ext: 'mp4' }])
    );
    expect(info?.formats[0].formatId).toBe('th_0');
  });

  it('returns null for null data or empty formats', () => {
    expect(normalizeVideoInfo(URL, null)).toBeNull();
    expect(normalizeVideoInfo(URL, parsed([]))).toBeNull();
  });

  it('applies id and title/uploader fallbacks', () => {
    const info = normalizeVideoInfo('https://www.threads.com/@x/post/Z', {
      id: null,
      title: '',
      uploader: '',
      thumbnail: '',
      formats: [
        {
          url: 'https://scontent.cdninstagram.com/x.mp4',
          format_id: 'hd',
          ext: 'mp4',
        },
      ],
    });
    expect(info?.id).toBe('https://www.threads.com/@x/post/Z');
    expect(info?.title).toBe('Threads Post');
    expect(info?.uploader).toBe('Threads User');
  });
});
