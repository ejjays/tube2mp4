import { describe, it, expect } from 'vitest';
import {
  normalizeArtist,
  normalizeTitle,
  type RawSocialData,
} from '@phantom/extractors';

describe('normalizeArtist', () => {
  it.each<[string, RawSocialData, string]>([
    [
      'trusts a youtube uploader',
      {
        webpageUrl: 'https://www.youtube.com/watch?v=x',
        uploader: 'Rick Astley',
      },
      'Rick Astley',
    ],
    [
      'rejects a youtube handle slug',
      { webpageUrl: 'https://youtu.be/x', uploader: 'coolchannel-ab12' },
      'YouTube User',
    ],
    [
      'keeps a valid metascraper author',
      {
        webpageUrl: 'https://www.facebook.com/x',
        metascraper: { author: 'Cool Page' },
      },
      'Cool Page',
    ],
    [
      'falls back to uploader when author is a platform name',
      {
        webpageUrl: 'https://www.instagram.com/x',
        uploader: 'realuser',
        metascraper: { author: 'Instagram' },
      },
      'realuser',
    ],
  ])('%s', (_label, input, expected) => {
    expect(normalizeArtist(input)).toBe(expected);
  });
});

describe('normalizeTitle', () => {
  it.each<[string, RawSocialData, string]>([
    [
      'splits an seo pipe title',
      {
        webpageUrl: 'https://www.facebook.com/x',
        metascraper: { title: 'My Cool Video | Facebook' },
      },
      'My Cool Video',
    ],
    [
      'drops engagement-metric junk to Video_<id>',
      {
        webpageUrl: 'https://www.facebook.com/x',
        id: 'abc',
        metascraper: { title: '1.2K views' },
      },
      'Video_abc',
    ],
    [
      'passes a clean plain title through',
      { webpageUrl: 'https://example.com/x', title: 'Hello World' },
      'Hello World',
    ],
  ])('%s', (_label, input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });
});
