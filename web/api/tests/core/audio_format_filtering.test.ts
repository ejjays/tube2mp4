import { describe, it, expect } from 'vitest';
import { processAudioFormats } from '../../src/utils/media/format.util.js';

/**
 * opus/webm audio has poor device compatibility; the picker should expose
 * m4a (+ synthetic mp3) only. drop opus/webm here at the single source.
 */
describe('processAudioFormats — opus/webm filtering', () => {
  const audio = [
    {
      itag: 140,
      ext: 'm4a',
      acodec: 'mp4a.40.2',
      abr: 130,
      url: 'https://r.example.com/a.m4a',
      has_audio: true,
      has_video: false,
    },
    {
      itag: 251,
      ext: 'webm',
      acodec: 'opus',
      abr: 133,
      url: 'https://r.example.com/a.webm',
      has_audio: true,
      has_video: false,
    },
  ];

  it('keeps m4a and drops opus/webm', () => {
    const result = processAudioFormats({ formats: audio });
    expect(result).toHaveLength(1);
    expect(result[0].extension).toBe('m4a');
  });
});
