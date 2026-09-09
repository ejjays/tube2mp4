import { describe, it, expect } from 'vitest';
import {
  processVideoFormats,
  dropAV1Formats,
} from '../../src/utils/media/format.util.js';

const sampleRawFormats = [
  {
    format_id: '137',
    url: 'https://googlevideo.com/v137',
    vcodec: 'avc1.640028',
    acodec: 'none',
    ext: 'mp4',
    height: 1080,
    width: 1920,
    fps: 60,
    tbr: 5000,
  },
  {
    format_id: '399',
    url: 'https://googlevideo.com/v399',
    vcodec: 'av01.0.08M.08',
    acodec: 'none',
    ext: 'mp4',
    height: 1080,
    width: 1920,
    fps: 60,
    tbr: 2800,
  },
  {
    format_id: '248',
    url: 'https://googlevideo.com/v248',
    vcodec: 'vp09.00.50.08',
    acodec: 'none',
    ext: 'webm',
    height: 1080,
    width: 1920,
    fps: 60,
    tbr: 4000,
  },
  {
    format_id: '401',
    url: 'https://googlevideo.com/v401',
    vcodec: 'av01.0.12M.08',
    acodec: 'none',
    ext: 'mp4',
    height: 2160,
    width: 3840,
    fps: 60,
    tbr: 12000,
  },
];

describe('AV1 filter: backend enforcement', () => {
  it('drops AV1 formats from processVideoFormats output by default', () => {
    const result = processVideoFormats({
      duration: 200,
      formats: sampleRawFormats,
    });
    const av1 = result.filter(
      (format) =>
        String(format.vcodec || '').startsWith('av01') ||
        [
          '394',
          '395',
          '396',
          '397',
          '398',
          '399',
          '400',
          '401',
          '571',
        ].includes(String(format.formatId || ''))
    );
    expect(av1).toHaveLength(0);
  });

  it('preserves H.264 or VP9 1080p (one mp4 entry survives dedup)', () => {
    const result = processVideoFormats({
      duration: 200,
      formats: sampleRawFormats,
    });
    // one 1080p mp4 expected
    const at1080p = result.filter((format) => format.height === 1080);
    expect(at1080p).toHaveLength(1);
    const winner = at1080p[0];
    expect(winner.extension).toBe('mp4');
    expect(['137', '248']).toContain(winner.formatId);
    // never the av1 (399) at 1080p
    expect(winner.formatId).not.toBe('399');
  });

  it('dropAV1Formats helper removes AV1 by vcodec prefix', () => {
    const formats = [
      {
        formatId: '137',
        vcodec: 'avc1.640028',
        url: 'x',
        extension: 'mp4',
        isVideo: true,
        isAudio: false,
        isMuxed: false,
        height: 1080,
      },
      {
        formatId: 'custom',
        vcodec: 'av01.0.08M.08',
        url: 'y',
        extension: 'mp4',
        isVideo: true,
        isAudio: false,
        isMuxed: false,
        height: 1080,
      },
    ] as Parameters<typeof dropAV1Formats>[0];
    const result = dropAV1Formats(formats);
    expect(result).toHaveLength(1);
    expect(result[0].formatId).toBe('137');
  });

  it('dropAV1Formats helper removes by formatId fallback', () => {
    const formats = [
      {
        formatId: '399',
        vcodec: '',
        url: 'x',
        extension: 'mp4',
        isVideo: true,
        isAudio: false,
        isMuxed: false,
        height: 1080,
      },
      {
        formatId: '137',
        vcodec: 'avc1',
        url: 'y',
        extension: 'mp4',
        isVideo: true,
        isAudio: false,
        isMuxed: false,
        height: 1080,
      },
    ] as Parameters<typeof dropAV1Formats>[0];
    const result = dropAV1Formats(formats);
    expect(result.map((fmt) => fmt.formatId)).toEqual(['137']);
  });
});
