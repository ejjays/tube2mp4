import { describe, it, expect } from 'vitest';
import {
  formatSize,
  formatLabel,
  dlLabel,
  prettyName,
  refererFor,
  previewableFormat,
  qualityText,
  extLabel,
  isAudioOnly,
  titleFor,
  subtitleFor,
  badgeFor,
  buildAudioOptions,
} from '../src/lib/format';
import { formatName } from '../src/lib/settings';
import type { Format, VideoInfo } from '@phantom/extractors';

const makeInfo = (formats: Format[]): VideoInfo => ({
  type: 'video',
  id: 'x',
  title: 't',
  uploader: 'u',
  webpageUrl: 'https://example.com',
  formats,
  extractorKey: 'test',
  isJsInfo: false,
  fromBrain: false,
  isPartial: false,
  isIsrcMatch: false,
  isFullData: true,
});

const makeFormat = (over: Partial<Format>): Format => ({
  formatId: 'f1',
  url: 'https://example.com/v.mp4',
  extension: 'mp4',
  isAudio: false,
  isVideo: true,
  isMuxed: true,
  ...over,
});

describe('formatSize', () => {
  it('returns empty string for missing or zero size', () => {
    expect(formatSize()).toBe('');
    expect(formatSize(0)).toBe('');
  });

  it('formats megabytes at or above 1MB', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats gigabytes at or above 1GB', () => {
    expect(formatSize(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
    expect(formatSize(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  it('formats kilobytes below 1MB', () => {
    expect(formatSize(512 * 1024)).toBe('512 KB');
  });
});

describe('formatLabel', () => {
  it('prefers quality, then resolution, then formatId', () => {
    expect(
      formatLabel(makeFormat({ quality: '1080p', resolution: '1920x1080' }))
    ).toBe('1080p');
    expect(formatLabel(makeFormat({ resolution: '1920x1080' }))).toBe(
      '1920x1080'
    );
    expect(formatLabel(makeFormat({ formatId: '137' }))).toBe('137');
  });
});

describe('dlLabel', () => {
  it('maps download state to a label', () => {
    expect(dlLabel({ status: 'downloading', progress: 42 })).toBe('42%');
    expect(dlLabel({ status: 'saved', progress: 100 })).toBe('Done ✓');
    expect(dlLabel({ status: 'error', progress: 0 })).toBe('Retry');
    expect(dlLabel()).toBe('Download');
  });
});

describe('prettyName', () => {
  it('strips characters illegal in filenames', () => {
    expect(prettyName('a<b>c:d"e/f\\g|h?i*j')).toBe('abcdefghij');
  });

  it('strips brackets and uri-unsafe punctuation', () => {
    expect(prettyName('Episode 1 [Tagalog Dubbed]')).toBe(
      'Episode 1 Tagalog Dubbed'
    );
    expect(prettyName('mix {a} #1 100% ^v `x`')).toBe('mix a 1 100 v x');
  });

  it('collapses whitespace, newlines and tabs into single spaces', () => {
    expect(prettyName('hello   \n\t world')).toBe('hello world');
  });

  it('falls back to "video" when nothing survives cleaning', () => {
    expect(prettyName('   ')).toBe('video');
    expect(prettyName('/\\:*?')).toBe('video');
  });

  it('truncates long titles to 64 chars with a short hash suffix (no ellipsis)', () => {
    const out = prettyName('x'.repeat(100));
    expect(out).toHaveLength(64);
    expect(out.startsWith('x'.repeat(59))).toBe(true);
    expect(out.endsWith('...')).toBe(false);
  });

  it('keeps distinct long titles from colliding via the hash suffix', () => {
    const a = prettyName('A'.repeat(80));
    const second = prettyName('B'.repeat(80));
    expect(a).not.toBe(second);
    expect(prettyName('A'.repeat(80))).toBe(a);
  });

  it('passes a clean title through unchanged', () => {
    expect(prettyName('My Cool Video')).toBe('My Cool Video');
  });
});

describe('refererFor', () => {
  it.each<[string, string]>([
    ['tiktok', 'https://www.tiktok.com/'],
    ['x', 'https://x.com/'],
    ['threads', 'https://www.threads.com/'],
    ['bluesky', 'https://bsky.app/'],
    ['reddit', 'https://www.reddit.com/'],
    ['facebook', 'https://www.facebook.com/'],
    ['youtube', 'https://www.facebook.com/'],
  ])('maps %s to its referer', (key, expected) => {
    expect(refererFor(key)).toBe(expected);
  });
});

describe('previewableFormat', () => {
  const muxed = makeFormat({ formatId: 'm', isMuxed: true });
  const videoOnly = makeFormat({
    formatId: 'v',
    isMuxed: false,
    muxAudioUrl: 'https://example.com/a.m4a',
  });
  const audioOnly = makeFormat({
    formatId: 'a',
    isAudio: true,
    isVideo: false,
    isMuxed: false,
  });

  it('returns a muxed video stream directly', () => {
    expect(previewableFormat([muxed], muxed, false)).toBe(muxed);
  });

  it('returns null for audio-only selection', () => {
    expect(previewableFormat([audioOnly], audioOnly, true)).toBeNull();
  });

  it('returns null for split a/v on non-reddit sources', () => {
    expect(
      previewableFormat([videoOnly], videoOnly, false, 'youtube')
    ).toBeNull();
  });

  it('previews reddit video-only track despite no muxed stream', () => {
    expect(previewableFormat([videoOnly], videoOnly, false, 'reddit')).toBe(
      videoOnly
    );
  });
});

describe('qualityText', () => {
  it.each<[string, string]>([
    ['4320p', '8K'],
    ['2160p', '4K'],
    ['1440p', '2K'],
  ])('maps %s to a short label', (quality, expected) => {
    expect(qualityText(makeFormat({ quality }))).toBe(expected);
  });

  it('reads the resolution field when quality is absent', () => {
    expect(
      qualityText(makeFormat({ quality: '', resolution: '3840x2160' }))
    ).toBe('4K');
  });

  it('falls back to formatLabel for other resolutions', () => {
    expect(qualityText(makeFormat({ quality: '1080p' }))).toBe('1080p');
    expect(
      qualityText(makeFormat({ quality: '', resolution: '', formatId: '137' }))
    ).toBe('137');
  });
});

describe('extLabel', () => {
  it('uppercases the extension', () => {
    expect(extLabel(makeFormat({ extension: 'mp4' }))).toBe('MP4');
    expect(extLabel(makeFormat({ extension: 'webm' }))).toBe('WEBM');
  });

  it('falls back to RAW when the extension is missing', () => {
    expect(extLabel(makeFormat({ extension: '' }))).toBe('RAW');
  });
});

describe('isAudioOnly', () => {
  it('is true only for audio without video', () => {
    expect(isAudioOnly(makeFormat({ isAudio: true, isVideo: false }))).toBe(
      true
    );
    expect(isAudioOnly(makeFormat({ isAudio: true, isVideo: true }))).toBe(
      false
    );
    expect(isAudioOnly(makeFormat({ isAudio: false, isVideo: true }))).toBe(
      false
    );
  });
});

describe('titleFor', () => {
  it('uses the extension label for audio-only formats', () => {
    expect(
      titleFor(makeFormat({ isAudio: true, isVideo: false, extension: 'm4a' }))
    ).toBe('M4A');
  });

  it('uses the quality text for video formats', () => {
    expect(titleFor(makeFormat({ quality: '2160p' }))).toBe('4K');
  });
});

describe('subtitleFor', () => {
  const size = 5 * 1024 * 1024; // "5.0 MB"

  it('labels transcoded mp3 as Converted', () => {
    expect(
      subtitleFor(
        makeFormat({
          isAudio: true,
          isVideo: false,
          extension: 'mp3',
          filesize: size,
        })
      )
    ).toBe('Converted · 5.0 MB');
  });

  it('labels native audio as Original', () => {
    expect(
      subtitleFor(
        makeFormat({
          isAudio: true,
          isVideo: false,
          extension: 'm4a',
          filesize: size,
        })
      )
    ).toBe('Original · 5.0 MB');
  });

  it('labels passthrough mp3 (noTranscode) as Original', () => {
    expect(
      subtitleFor(
        makeFormat({
          isAudio: true,
          isVideo: false,
          extension: 'mp3',
          noTranscode: true,
          filesize: size,
        })
      )
    ).toBe('Original · 5.0 MB');
  });

  it('shows size and extension for video', () => {
    expect(subtitleFor(makeFormat({ extension: 'mp4', filesize: size }))).toBe(
      '5.0 MB · MP4'
    );
  });

  it('omits size when it is unknown', () => {
    expect(
      subtitleFor(
        makeFormat({ isAudio: true, isVideo: false, extension: 'mp3' })
      )
    ).toBe('Converted');
    expect(subtitleFor(makeFormat({ extension: 'mp4' }))).toBe('MP4');
  });
});

describe('badgeFor', () => {
  it('flags transcoded mp3 as HIGH', () => {
    expect(
      badgeFor(makeFormat({ isAudio: true, isVideo: false, extension: 'mp3' }))
    ).toEqual({ label: 'HIGH', tone: 'cyan' });
  });

  it('flags native audio as MAX', () => {
    expect(
      badgeFor(makeFormat({ isAudio: true, isVideo: false, extension: 'm4a' }))
    ).toEqual({ label: 'MAX', tone: 'amber' });
    expect(
      badgeFor(
        makeFormat({
          isAudio: true,
          isVideo: false,
          extension: 'mp3',
          noTranscode: true,
        })
      )
    ).toEqual({ label: 'MAX', tone: 'amber' });
  });

  it('returns null for muxed video (no badge)', () => {
    expect(badgeFor(makeFormat({ isMuxed: true }))).toBeNull();
  });

  it('returns null for split (non-muxed) video', () => {
    expect(badgeFor(makeFormat({ isMuxed: false }))).toBeNull();
  });
});

describe('formatName', () => {
  it('falls back to a safe title when title is missing', () => {
    expect(formatName('title', undefined, 'MrBeast', 'youtube')).toBe(
      'Untitled'
    );
    expect(
      formatName('artist-title', undefined, 'MrBeast', 'youtube')
    ).toBe('MrBeast - Untitled');
  });

  it('drops the artist when absent for artist-title', () => {
    expect(formatName('artist-title', 'Best video', undefined, 'youtube')).toBe(
      'Best video'
    );
  });

  it('tags the platform for title-platform', () => {
    expect(formatName('title-platform', 'Best video', 'MrBeast', 'youtube')).toBe(
      'Best video (Youtube)'
    );
  });
});

describe('buildAudioOptions', () => {
  it('native audio-only → MAX (original) + HIGH (mp3)', () => {
    const opts = buildAudioOptions(
      makeInfo([
        makeFormat({
          formatId: 'a',
          isAudio: true,
          isVideo: false,
          isMuxed: false,
          extension: 'm4a',
          url: 'https://x/a.m4a',
          tbr: 130,
        }),
        makeFormat({ formatId: 'v', extension: 'mp4' }),
      ])
    );
    expect(opts).toHaveLength(2);
    expect(opts[0].extension).toBe('m4a');
    expect(isAudioOnly(opts[0])).toBe(true);
    expect(badgeFor(opts[0])).toEqual({ label: 'MAX', tone: 'amber' });
    expect(opts[1].extension).toBe('mp3');
    expect(opts[1].formatId).toBe('audio-mp3');
    expect(badgeFor(opts[1])).toEqual({ label: 'HIGH', tone: 'cyan' });
  });

  it('picks the highest-bitrate native track for MAX', () => {
    const opts = buildAudioOptions(
      makeInfo([
        makeFormat({
          formatId: 'lo',
          isAudio: true,
          isVideo: false,
          isMuxed: false,
          extension: 'm4a',
          url: 'https://x/lo.m4a',
          tbr: 64,
        }),
        makeFormat({
          formatId: 'hi',
          isAudio: true,
          isVideo: false,
          isMuxed: false,
          extension: 'm4a',
          url: 'https://x/hi.m4a',
          tbr: 256,
        }),
      ])
    );
    expect(opts[0].formatId).toBe('hi');
  });

  it('native mp3 passthrough → MAX only (no redundant convert)', () => {
    const opts = buildAudioOptions(
      makeInfo([
        makeFormat({
          formatId: 'a',
          isAudio: true,
          isVideo: false,
          isMuxed: false,
          extension: 'mp3',
          noTranscode: true,
          url: 'https://x/a.mp3',
        }),
      ])
    );
    expect(opts).toHaveLength(1);
    expect(opts[0].extension).toBe('mp3');
  });

  it('native hls audio → MAX only (mp3 needs a direct file)', () => {
    const opts = buildAudioOptions(
      makeInfo([
        makeFormat({
          formatId: 'a',
          isAudio: true,
          isVideo: false,
          isMuxed: false,
          extension: 'm4a',
          isHls: true,
          url: 'https://x/a.m3u8',
        }),
      ])
    );
    expect(opts).toHaveLength(1);
  });

  it('separate audio track (muxAudioUrl) → downloads it directly for MAX', () => {
    const opts = buildAudioOptions(
      makeInfo([
        makeFormat({
          formatId: 'v',
          isMuxed: false,
          isVideo: true,
          isAudio: false,
          extension: 'mp4',
          url: 'https://x/v.mp4',
          muxAudioUrl: 'https://x/a.m4a',
          muxAudioExt: 'm4a',
        }),
      ])
    );
    expect(opts).toHaveLength(2);
    expect(opts[0].url).toBe('https://x/a.m4a');
    expect(opts[0].audioDemux).toBeFalsy();
    expect(opts[0].extension).toBe('m4a');
    expect(opts[1].extension).toBe('mp3');
  });

  it('progressive muxed video → demux MAX (m4a) + HIGH (mp3)', () => {
    const opts = buildAudioOptions(
      makeInfo([
        makeFormat({
          formatId: 'm',
          isMuxed: true,
          isVideo: true,
          isAudio: true,
          extension: 'mp4',
          url: 'https://x/m.mp4',
        }),
      ])
    );
    expect(opts).toHaveLength(2);
    expect(opts[0].audioDemux).toBe(true);
    expect(opts[0].extension).toBe('m4a');
    expect(opts[1].extension).toBe('mp3');
  });

  it('muxed hls only → no audio option (needs a direct file)', () => {
    const opts = buildAudioOptions(
      makeInfo([
        makeFormat({
          formatId: 'm',
          isMuxed: true,
          isVideo: true,
          isAudio: true,
          isHls: true,
          extension: 'mp4',
          url: 'https://x/m.m3u8',
        }),
      ])
    );
    expect(opts).toHaveLength(0);
  });

  it('silent video / image → no audio option', () => {
    const opts = buildAudioOptions(
      makeInfo([
        makeFormat({
          formatId: 'v',
          isMuxed: false,
          isVideo: true,
          isAudio: false,
          extension: 'mp4',
          url: 'https://x/v.mp4',
        }),
      ])
    );
    expect(opts).toHaveLength(0);
  });
});
