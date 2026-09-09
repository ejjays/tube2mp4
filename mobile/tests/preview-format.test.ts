import { describe, it, expect } from 'vitest';
import { previewableFormat } from '../src/lib/format';
import type { Format } from '@phantom/extractors';

const makeFormat = (over: Partial<Format>): Format => ({
  formatId: 'f1',
  url: 'https://example.com/v.mp4',
  extension: 'mp4',
  isAudio: false,
  isVideo: true,
  isMuxed: true,
  ...over,
});

describe('previewableFormat', () => {
  it('returns null for audio selection', () => {
    const formats = [makeFormat({ formatId: 'mux', isMuxed: true })];
    const audio = makeFormat({
      formatId: 'a1',
      isAudio: true,
      isVideo: false,
      isMuxed: false,
    });
    expect(previewableFormat(formats, audio, true)).toBeNull();
  });

  it('uses the selected format when it is muxed video', () => {
    const selected = makeFormat({
      formatId: 'sel',
      url: 'https://example.com/selected.mp4',
    });
    expect(previewableFormat([selected], selected, false)).toBe(selected);
  });

  it('falls back to any muxed video format when selection is adaptive', () => {
    const adaptive = makeFormat({
      formatId: 'hi',
      isMuxed: false,
      url: 'https://example.com/video-only.mp4',
    });
    const muxed = makeFormat({
      formatId: 'mux',
      isMuxed: true,
      url: 'https://example.com/progressive.mp4',
    });
    expect(previewableFormat([adaptive, muxed], adaptive, false)).toBe(muxed);
  });

  it('returns null when no muxed video stream exists', () => {
    const adaptive = makeFormat({ formatId: 'hi', isMuxed: false });
    expect(previewableFormat([adaptive], adaptive, false)).toBeNull();
  });

  it('ignores muxed formats without a url', () => {
    const noUrl = makeFormat({ formatId: 'mux', isMuxed: true, url: '' });
    expect(previewableFormat([noUrl], null, false)).toBeNull();
  });
});
