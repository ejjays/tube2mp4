import { describe, it, expect } from 'vitest';
import { audioMetadataArgs } from '../../src/services/ytdlp/processor.js';

describe('audioMetadataArgs', () => {
  it('builds title + artist (from uploader) tags', () => {
    expect(audioMetadataArgs({ title: 'Song', uploader: 'Artist' })).toEqual([
      '-metadata',
      'title=Song',
      '-metadata',
      'artist=Artist',
    ]);
  });

  it('includes album and year when present', () => {
    expect(
      audioMetadataArgs({
        title: 'S',
        uploader: 'A',
        album: 'Alb',
        year: '2021',
      })
    ).toEqual([
      '-metadata',
      'title=S',
      '-metadata',
      'artist=A',
      '-metadata',
      'album=Alb',
      '-metadata',
      'date=2021',
    ]);
  });

  it('omits missing fields and an "Unknown" year', () => {
    expect(audioMetadataArgs({ title: 'S', year: 'Unknown' })).toEqual([
      '-metadata',
      'title=S',
    ]);
    expect(audioMetadataArgs({})).toEqual([]);
  });

  it('keeps spaces and symbols intact (array args, no shell)', () => {
    expect(
      audioMetadataArgs({ title: 'A B (feat. C) = x', uploader: 'D & E' })
    ).toEqual([
      '-metadata',
      'title=A B (feat. C) = x',
      '-metadata',
      'artist=D & E',
    ]);
  });
});
