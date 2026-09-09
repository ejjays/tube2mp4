import { describe, it, expect } from 'vitest';
import {
  cleanFormats,
  parseCachedMapping,
} from '../../src/services/spotify/brain.js';

const good = { formatId: '137', url: 'https://x/v.mp4', extension: 'mp4' };

describe('cleanFormats', () => {
  it('keeps well-shaped formats', () => {
    expect(cleanFormats([good])).toHaveLength(1);
  });

  it('drops legacy snake-case (format_id) rows', () => {
    expect(cleanFormats([{ format_id: '96', ext: 'mp4' }])).toEqual([]);
  });

  it('drops "undefined" formatId and PENDING_DECIPHER urls', () => {
    expect(cleanFormats([{ formatId: 'undefined' }])).toEqual([]);
    expect(
      cleanFormats([{ formatId: '137', url: 'PENDING_DECIPHER_137' }])
    ).toEqual([]);
  });

  it('parses a JSON string and filters poison out', () => {
    expect(
      cleanFormats(JSON.stringify([good, { format_id: '96' }]))
    ).toHaveLength(1);
  });

  it('returns [] for junk input', () => {
    expect(cleanFormats('not json')).toEqual([]);
    expect(cleanFormats(null)).toEqual([]);
    expect(cleanFormats(42)).toEqual([]);
  });
});

describe('parseCachedMapping', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    youtubeUrl: 'https://www.youtube.com/watch?v=x',
    formats: JSON.stringify([good]),
    audioFormats: '[]',
    ...over,
  });

  it('returns parsed formats for a valid mapping', () => {
    expect(parseCachedMapping(row())?.formats).toHaveLength(1);
  });

  it('is null when youtubeUrl is missing or not http', () => {
    expect(parseCachedMapping(row({ youtubeUrl: '' }))).toBeNull();
    expect(parseCachedMapping(row({ youtubeUrl: 'PENDING' }))).toBeNull();
  });

  it('is null when every cached format is poison (legacy rows)', () => {
    expect(
      parseCachedMapping(
        row({ formats: JSON.stringify([{ format_id: '96' }]) })
      )
    ).toBeNull();
  });

  it('is null when formats are empty', () => {
    expect(parseCachedMapping(row({ formats: '[]' }))).toBeNull();
  });
});
