import { describe, it, expect } from 'vitest';
import { fetchMetadata } from '../../src/utils/media/metadata.util.js';
import {
  normalizeTitle,
  normalizeArtist,
  getBestThumbnail,
} from '../../src/services/social.service.js';
import { getInfo } from '../../src/services/extractors/index.js';

describe('Metascraper Integration', () => {
  it('should fetch metadata for a generic URL', async () => {
    // test live url
    const url = 'https://github.com/microlinkhq/metascraper';
    const metadata = await fetchMetadata(url);

    expect(metadata).not.toBeNull();
    expect(metadata?.title).toContain('metascraper');
    expect(metadata?.author || metadata?.publisher).toBeTruthy();
  });

  it('should prioritize metascraper data in social normalization', () => {
    const mockInfo = {
      title: 'Original Title',
      uploader: 'Original Uploader',
      metascraper: {
        title: 'Metascraper Title',
        author: 'Metascraper Author',
        image: 'https://example.com/meta.jpg',
      },
    };

    expect(normalizeTitle(mockInfo)).toBe('Metascraper Title');
    expect(normalizeArtist(mockInfo)).toBe('Metascraper Author');
    expect(getBestThumbnail(mockInfo)).toBe('https://example.com/meta.jpg');
  });

  it('should fallback to yt-dlp data if metascraper data is missing', () => {
    const mockInfo = {
      title: 'Original Title',
      uploader: 'Original Uploader',
      metascraper: {},
    };

    expect(normalizeTitle(mockInfo)).toBe('Original Title');
    expect(normalizeArtist(mockInfo)).toBe('Original Uploader');
  });

  it('should use genericExtractor for unsupported URLs in getInfo', async () => {
    const url = 'https://example.com';
    // check generic extractor
    const info = await getInfo(url);
    expect(info).toBeTruthy();
    expect(info.webpageUrl).toBe(url);
  });
});
