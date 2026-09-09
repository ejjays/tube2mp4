import { describe, it, expect } from 'vitest';
import {
  getSanitizedFilename,
  generateUUID,
  getQualityLabel,
  formatSize,
} from '../src/lib/utils';

describe('getSanitizedFilename', () => {
  it('appends the format extension', () => {
    expect(getSanitizedFilename('My Video', '', 'mp4', false)).toBe(
      'My Video.mp4'
    );
  });

  it('prefixes artist for spotify requests', () => {
    expect(getSanitizedFilename('Song', 'Artist', 'mp3', true)).toBe(
      'Artist - Song.mp3'
    );
  });

  it('omits the prefix when a spotify artist is missing', () => {
    expect(getSanitizedFilename('Song', '', 'mp3', true)).toBe('Song.mp3');
  });

  it('strips filesystem-illegal characters', () => {
    expect(getSanitizedFilename('a<b>c:"d/e|f?g*h', '', 'mp4', false)).toBe(
      'abcdefgh.mp4'
    );
  });

  it('collapses newlines, tabs and repeated spaces', () => {
    expect(getSanitizedFilename('a\nb\tc   d', '', 'mp4', false)).toBe(
      'a b c d.mp4'
    );
  });

  it('truncates very long titles', () => {
    const out = getSanitizedFilename('x'.repeat(100), '', 'mp4', false);
    expect(out.length).toBeLessThan(100);
    expect(out).toContain('...');
    expect(out.endsWith('.mp4')).toBe(true);
  });

  it('falls back to "video" when nothing usable remains', () => {
    expect(getSanitizedFilename('<<<>>>', '', 'mp4', false)).toBe('video.mp4');
  });
});

describe('generateUUID', () => {
  it('produces a v4-shaped uuid', () => {
    expect(generateUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });

  it('produces unique values across calls', () => {
    expect(generateUUID()).not.toBe(generateUUID());
  });
});

describe('getQualityLabel uncovered branches', () => {
  it('maps 4320 to 8K', () => {
    expect(getQualityLabel('4320p')).toBe('8K');
  });

  it('maps 1440 to 2K', () => {
    expect(getQualityLabel('1440p')).toBe('2K');
  });

  it('returns Unknown for undefined', () => {
    expect(getQualityLabel()).toBe('Unknown');
  });
});

describe('formatSize edge', () => {
  it('treats zero bytes as unknown', () => {
    expect(formatSize(0)).toBe('Unknown size');
  });
});
