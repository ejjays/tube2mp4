import { describe, it, expect } from 'vitest';
import { normalizeTitle } from '../../src/services/social.service.js';

/**
 * Regression: FB videos exposed junk titles like
 * "58K views · 50 reactions | ... | Facebook" and "Related videos".
 * These must be rejected in favor of the uploader name.
 */
describe('normalizeTitle — facebook junk rejection', () => {
  const fbUrl = 'https://www.facebook.com/x/videos/123/';

  it('rejects "N views · N reactions" and uses the author', () => {
    expect(
      normalizeTitle({
        webpageUrl: fbUrl,
        metascraper: {
          title: '58K views · 50 reactions | Example on Reels | Facebook',
          author: 'Example on Reels',
        },
      })
    ).toBe('Example on Reels');
  });

  it('rejects a "Related videos" section heading', () => {
    expect(
      normalizeTitle({
        webpageUrl: fbUrl,
        title: 'Related videos',
        uploader: 'Jack Swynnerton',
      })
    ).toBe('Jack Swynnerton');
  });

  it('keeps a genuine caption title', () => {
    expect(
      normalizeTitle({
        webpageUrl: fbUrl,
        metascraper: {
          title: 'The most advanced eye in nature | Jack Swynnerton | Facebook',
          author: 'Jack Swynnerton',
        },
      })
    ).toBe('The most advanced eye in nature');
  });
});
