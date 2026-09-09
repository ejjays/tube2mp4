import { describe, it, expect } from 'vitest';
import {
  processAudioFormats,
  resolveAudioTrack,
} from '../../src/utils/media/format.util.js';
import {
  selectAudioFormat,
  pickAudioLanguagePool,
} from '../../src/utils/media/stream.util.js';
import { Format } from '../../src/types/index.js';

/**
 * YouTube multi-language (dubbed) audio: the original track must default and
 * dubs must survive dedup so the picker can offer them. Single-track videos
 * must behave exactly as before.
 */

const m4a = (
  itag: number,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  itag,
  ext: 'm4a',
  acodec: 'mp4a.40.2',
  abr: 130,
  url: `https://r.example.com/${itag}.m4a`,
  has_audio: true,
  has_video: false,
  ...extra,
});

describe('resolveAudioTrack', () => {
  it('reads youtubei.js audio_track shape (original via audio_is_default)', () => {
    const track = resolveAudioTrack({
      audio_track: {
        id: 'en-US.4',
        display_name: 'English original',
        audio_is_default: true,
      },
    });
    expect(track.language).toBe('en-US');
    expect(track.languageName).toBe('English original');
    expect(track.isOriginal).toBe(true);
  });

  it('reads yt-dlp shape (language + format_note original)', () => {
    const track = resolveAudioTrack({
      language: 'en',
      format_note: 'American English original (default), medium',
      language_preference: 10,
    });
    expect(track.language).toBe('en');
    expect(track.isOriginal).toBe(true);
  });

  it('marks a dubbed track as not original', () => {
    const track = resolveAudioTrack({
      language: 'es',
      format_note: 'Spanish (Spain) - dubbed-auto, low',
      language_preference: -1,
    });
    expect(track.language).toBe('es');
    expect(track.isOriginal).toBeUndefined();
  });

  it('returns empty for a track with no language metadata', () => {
    expect(resolveAudioTrack({ acodec: 'mp4a.40.2' })).toEqual({});
  });
});

describe('processAudioFormats — multi-language', () => {
  it('keeps one track per language and floats the original first', () => {
    const result = processAudioFormats({
      formats: [
        m4a(140, { language: 'es', format_note: 'Spanish dubbed-auto' }),
        m4a(141, {
          language: 'en',
          format_note: 'English original (default)',
          language_preference: 10,
        }),
        m4a(142, { language: 'hi', format_note: 'Hindi dubbed-auto' }),
      ],
    });
    expect(result).toHaveLength(3);
    expect(result[0].language).toBe('en');
    expect(result[0].isOriginal).toBe(true);
    expect(result.map((fmt) => fmt.language).sort()).toEqual(['en', 'es', 'hi']);
  });

  it('does not collapse same-bitrate dubs into one entry', () => {
    const result = processAudioFormats({
      formats: [
        m4a(140, { language: 'en', is_original: true }),
        m4a(141, { language: 'es' }),
      ],
    });
    expect(result).toHaveLength(2);
  });

  it('single-track video is unchanged (no language metadata)', () => {
    const result = processAudioFormats({ formats: [m4a(140)] });
    expect(result).toHaveLength(1);
    expect(result[0].isOriginal).toBeUndefined();
    expect(result[0].language).toBeUndefined();
  });
});

describe('pickAudioLanguagePool', () => {
  const pool: Format[] = [
    { formatId: 'en', extension: 'm4a', acodec: 'mp4a', vcodec: 'none', url: 'u', language: 'en', isOriginal: true } as Format,
    { formatId: 'es', extension: 'm4a', acodec: 'mp4a', vcodec: 'none', url: 'u', language: 'es-419' } as Format,
  ];

  it('returns the exact language match', () => {
    expect(pickAudioLanguagePool(pool, 'es-419').map((fmt) => fmt.language)).toEqual(['es-419']);
  });

  it('falls back to base-language match (es -> es-419)', () => {
    expect(pickAudioLanguagePool(pool, 'es').map((fmt) => fmt.language)).toEqual(['es-419']);
  });

  it('defaults to the original track when no language requested', () => {
    expect(pickAudioLanguagePool(pool).map((fmt) => fmt.language)).toEqual(['en']);
  });

  it('passes through untouched when no language metadata exists', () => {
    const plain: Format[] = [
      { formatId: '140', extension: 'm4a', acodec: 'mp4a', vcodec: 'none', url: 'u' } as Format,
    ];
    expect(pickAudioLanguagePool(plain, 'es')).toHaveLength(1);
  });
});

describe('selectAudioFormat — language aware (video mux path)', () => {
  const formats: Format[] = [
    { formatId: 'a-en', extension: 'm4a', acodec: 'mp4a.40.2', vcodec: 'none', url: 'u-en', quality: '130kbps', language: 'en', isOriginal: true } as Format,
    { formatId: 'a-es', extension: 'm4a', acodec: 'mp4a.40.2', vcodec: 'none', url: 'u-es', quality: '130kbps', language: 'es' } as Format,
  ];

  it('defaults to the original track for a video download', () => {
    const picked = selectAudioFormat(formats, '137', false, false);
    expect(picked?.language).toBe('en');
  });

  it('honors a requested dub language', () => {
    const picked = selectAudioFormat(formats, '137', false, false, 'es');
    expect(picked?.language).toBe('es');
  });
});
