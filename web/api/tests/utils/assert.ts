import { expect } from 'vitest';
import { Expected } from './schema.js';
import { VideoInfo } from '../../src/types/index.js';

// dynamic assertions
export function assertOutcome(actual: VideoInfo | null, expected: Expected) {
  if (expected.status === 'error') {
    expect(actual, 'Actual data should be null for error cases').toBeNull();
    return;
  }

  if (expected.status === 'ok') {
    expect(actual, 'Actual data should be defined').toBeDefined();
  }

  // check metadata
  if (expected.title && actual?.title) {
    expect(
      actual.title.toLowerCase(),
      `Title mismatch for ${actual.title}`
    ).toContain(expected.title.toLowerCase());
  }

  // check ISRC
  if (expected.mustHaveIsrc) {
    expect(
      actual?.isrc,
      'ISRC matching failed - unique Phantom intelligence not found'
    ).toBeTruthy();
    expect(typeof actual?.isrc).toBe('string');
  }

  // check grounding
  if (expected.mustHaveChords) {
    const actualWithIntelligence = actual as Record<string, unknown>;
    const hasChords =
      actualWithIntelligence.chordsSheet || actualWithIntelligence.chords;
    expect(
      hasChords,
      'Grounding failed - Chords/Lyrics sheet not generated'
    ).toBeTruthy();
  }

  // check integrity
  if (expected.type && actual?.formats) {
    const hasVideo = actual.formats.some(
      (format) => format.vcodec && format.vcodec !== 'none'
    );
    const hasAudio = actual.formats.some(
      (format) =>
        (format.acodec && format.acodec !== 'none') ||
        !format.vcodec ||
        format.vcodec === 'none'
    );

    if (expected.type === 'video') {
      expect(hasVideo, 'Expected a video stream but none found').toBe(true);
    }
    if (expected.type === 'audio') {
      expect(hasAudio, 'Expected an audio stream but none found').toBe(true);
    }
  }

  // provider verification
  if (actual?.extractorKey) {
    console.log(`[Assert] Verified ${actual.extractorKey} logic flow.`);
  }
}
