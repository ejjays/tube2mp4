import { describe, it, expect } from 'vitest';
import { normalizeArtist } from '../../src/services/social.service.js';

/**
 * Regression tests for the YouTube handle-slug rejection logic.
 *
 * Bug: metascraper-author was extracting URL slugs like "nijummd-ru1jz"
 * from the YouTube watch page <link itemprop="url"> instead of the channel
 * display name. normalizeArtist must reject these auto-generated handle
 * slugs and fall through to the next candidate (channel/creator).
 *
 * Pattern detected: lowercase, no spaces, hyphen + 4-6 char alphanumeric
 * suffix (e.g. "nijummd-ru1jz", "abc-x1y2z3").
 */

describe('normalizeArtist — YouTube handle-slug rejection', () => {
  const ytUrl = 'https://www.youtube.com/watch?v=abc';

  it('returns the proper channel display name when uploader is clean', () => {
    expect(
      normalizeArtist({
        uploader: 'NJM RUI',
        webpageUrl: ytUrl,
      })
    ).toBe('NJM RUI');
  });

  it('REJECTS the YouTube handle-slug pattern in uploader and falls through to channel', () => {
    expect(
      normalizeArtist({
        uploader: 'nijummd-ru1jz',
        channel: 'NJM RUI',
        webpageUrl: ytUrl,
      })
    ).toBe('NJM RUI');
  });

  it('REJECTS the slug pattern in author and uses channel/creator', () => {
    expect(
      normalizeArtist({
        author: 'foobar-x12y3',
        channel: 'Foobar Official',
        webpageUrl: ytUrl,
      })
    ).toBe('Foobar Official');
  });

  it('falls through every slug-shaped candidate before giving up', () => {
    expect(
      normalizeArtist({
        uploader: 'one-aa1b2',
        author: 'two-cc3d4',
        channel: 'three-ee5f6',
        creator: 'Real Creator Name',
        webpageUrl: ytUrl,
      })
    ).toBe('Real Creator Name');
  });

  it('returns "YouTube User" when every candidate looks like a slug', () => {
    expect(
      normalizeArtist({
        uploader: 'one-aa1b2',
        author: 'two-cc3d4',
        channel: 'three-ee5f6',
        creator: 'four-gg7h8',
        webpageUrl: ytUrl,
      })
    ).toBe('YouTube User');
  });

  it('does NOT reject names that contain spaces (real channel names with hyphens)', () => {
    expect(
      normalizeArtist({
        uploader: 'Mr-Beast Fan',
        webpageUrl: ytUrl,
      })
    ).toBe('Mr-Beast Fan');
  });

  it('does NOT reject mixed-case names (real channel handles often have caps)', () => {
    expect(
      normalizeArtist({
        uploader: 'Channel-Name',
        webpageUrl: ytUrl,
      })
    ).toBe('Channel-Name');
  });

  it('does NOT reject names with too long a suffix (>6 chars after hyphen)', () => {
    expect(
      normalizeArtist({
        uploader: 'someone-channel123',
        webpageUrl: ytUrl,
      })
    ).toBe('someone-channel123');
  });

  it('does NOT reject names without a hyphen', () => {
    expect(
      normalizeArtist({
        uploader: 'channelname',
        webpageUrl: ytUrl,
      })
    ).toBe('channelname');
  });

  it('handles youtu.be short URLs the same as youtube.com', () => {
    expect(
      normalizeArtist({
        uploader: 'realchannelname',
        webpageUrl: 'https://youtu.be/abc123',
      })
    ).toBe('realchannelname');
  });

  it('rejects the exact reported failure case "nijummd-ru1jz"', () => {
    expect(
      normalizeArtist({
        uploader: 'nijummd-ru1jz',
        webpageUrl: ytUrl,
      })
    ).toBe('YouTube User');
  });
});

/**
 * Sanity tests confirming non-YouTube paths are unaffected.
 */
describe('normalizeArtist — non-YouTube paths unchanged', () => {
  it('uses metascraper.author for generic URLs', () => {
    expect(
      normalizeArtist({
        title: 'Some Page',
        uploader: 'Original',
        metascraper: {
          author: 'Metascraper Author',
        },
      })
    ).toBe('Metascraper Author');
  });

  it('falls back to platform name for invalid Instagram author', () => {
    expect(
      normalizeArtist({
        webpageUrl: 'https://instagram.com/p/xyz',
        metascraper: { author: 'instagram' },
      })
    ).toBe('Instagram');
  });
});
