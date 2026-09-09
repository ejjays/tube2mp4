import { describe, it, expect } from 'vitest';
import {
  normalizeArtist,
  normalizeTitle,
  type RawSocialData,
} from '@phantom/extractors';
import { ExtractorError } from '@phantom/extractors';
import {
  notFound,
  privateVideo,
  loginRequired,
  geoBlocked,
  ageRestricted,
  restricted,
  noVideo,
  networkError,
  rateLimited,
  serverError,
  temporaryError,
  fromStatus,
  classifyThrown,
} from '@phantom/extractors';

const social = (over: Partial<RawSocialData> = {}): RawSocialData => ({
  title: 'Cool Video',
  uploader: 'TestUser',
  ...over,
});

describe('ExtractorError', () => {
  it('stores retryable + expected flags', () => {
    const err = new ExtractorError('broken', true, true);
    expect(err.message).toBe('broken');
    expect(err.retryable).toBe(true);
    expect(err.expected).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults expected to false', () => {
    const err = new ExtractorError('fail', false);
    expect(err.expected).toBe(false);
  });
});

describe('error factories', () => {
  it('notFound is permanent + expected', () => {
    const e = notFound('YouTube');
    expect(e.retryable).toBe(false);
    expect(e.expected).toBe(true);
    expect(e.message).toContain('YouTube');
    expect(e.message).toContain("doesn't exist");
  });

  it('privateVideo is permanent + expected', () => {
    const e = privateVideo('TikTok');
    expect(e.retryable).toBe(false);
    expect(e.expected).toBe(true);
    expect(e.message).toContain('private');
  });

  it('loginRequired is permanent + expected', () => {
    const e = loginRequired('Instagram');
    expect(e.retryable).toBe(false);
    expect(e.expected).toBe(true);
    expect(e.message).toContain('login');
  });

  it('geoBlocked is permanent + expected', () => {
    const e = geoBlocked('YouTube');
    expect(e.retryable).toBe(false);
    expect(e.expected).toBe(true);
    expect(e.message).toContain('region');
  });

  it('ageRestricted is permanent + expected', () => {
    const e = ageRestricted('YouTube');
    expect(e.retryable).toBe(false);
    expect(e.expected).toBe(true);
    expect(e.message).toContain('age-restricted');
  });

  it('restricted with reason is permanent + expected', () => {
    const e = restricted('Facebook', '(NSFW)');
    expect(e.retryable).toBe(false);
    expect(e.expected).toBe(true);
    expect(e.message).toContain('restricted');
    expect(e.message).toContain('(NSFW)');
  });

  it('noVideo is permanent, but expected', () => {
    const e = noVideo('Reddit');
    expect(e.retryable).toBe(false);
    expect(e.expected).toBe(true);
    expect(e.message).toContain('downloadable');
  });

  it('accepts custom noun', () => {
    expect(notFound('Spotify', 'track').message).toContain('track');
    expect(privateVideo('X', 'post').message).toContain('post');
  });

  it('networkError is transient + expected', () => {
    const e = networkError('TikTok');
    expect(e.retryable).toBe(true);
    expect(e.expected).toBe(true);
    expect(e.message).toContain('connection');
  });

  it('rateLimited is transient', () => {
    const e = rateLimited('Instagram');
    expect(e.retryable).toBe(true);
    expect(e.message).toContain('busy');
  });

  it('serverError is transient', () => {
    const e = serverError('X');
    expect(e.retryable).toBe(true);
    expect(e.message).toContain('server error');
  });

  it('temporaryError is transient', () => {
    const e = temporaryError('Bluesky');
    expect(e.retryable).toBe(true);
    expect(e.message).toContain('try again');
  });
});

describe('fromStatus', () => {
  it.each([
    [404, 'notFound'],
    [410, 'notFound'],
    [401, 'loginRequired'],
    [403, 'loginRequired'],
    [429, 'rateLimited'],
    [500, 'serverError'],
    [502, 'serverError'],
    [503, 'serverError'],
  ] as const)('maps HTTP %i correctly', (status, _kind) => {
    const e = fromStatus(status, 'Test');
    expect(e).toBeInstanceOf(ExtractorError);
    if (status === 404 || status === 410) {
      expect(e.retryable).toBe(false);
      expect(e.expected).toBe(true);
    }
    if (status === 429) {
      expect(e.retryable).toBe(true);
    }
    if (status >= 500) {
      expect(e.retryable).toBe(true);
    }
  });

  it('falls back to noVideo for unknown status', () => {
    const e = fromStatus(418, 'Test');
    expect(e.retryable).toBe(false);
    expect(e.message).toContain('downloadable');
  });
});

describe('classifyThrown', () => {
  it('passes ExtractorError through as-is', () => {
    const orig = rateLimited('X');
    expect(classifyThrown(orig, 'X')).toBe(orig);
  });

  it('classifies network-like messages as networkError', () => {
    const e = classifyThrown(new Error('fetch failed'), 'YouTube');
    expect(e.retryable).toBe(true);
    expect(e.message).toContain('connection');
  });

  it('classifies timeout as networkError', () => {
    const e = classifyThrown(new Error('Request timeout'), 'TikTok');
    expect(e.retryable).toBe(true);
  });

  it('classifies unknown errors as temporaryError', () => {
    const e = classifyThrown(new Error('something weird'), 'Reddit');
    expect(e.retryable).toBe(true);
    expect(e.message).toContain('try again');
  });

  it('handles non-Error thrown values', () => {
    const e = classifyThrown('string error', 'FB');
    expect(e).toBeInstanceOf(ExtractorError);
  });
});

describe('normalizeArtist', () => {
  it('returns uploader when available', () => {
    expect(normalizeArtist(social({ uploader: 'MrBeast' }))).toBe('MrBeast');
  });

  it('uses metascraper author when valid', () => {
    expect(
      normalizeArtist(
        social({
          metascraper: { author: 'RealAuthor' },
          uploader: 'Fallback',
        })
      )
    ).toBe('RealAuthor');
  });

  it('rejects generic platform names from metascraper', () => {
    const result = normalizeArtist(
      social({
        metascraper: { author: 'Facebook' },
        uploader: 'ActualUser',
      })
    );
    expect(result).toBe('ActualUser');
  });

  it('rejects generic platform names case-insensitively', () => {
    const result = normalizeArtist(
      social({
        metascraper: { author: 'instagram' },
        uploader: 'RealUser',
      })
    );
    expect(result).toBe('RealUser');
  });

  it('guesses author from pipe-separated title', () => {
    const result = normalizeArtist(
      social({
        title: 'Cool post | AuthorName | Facebook',
        metascraper: { author: 'Facebook' },
        uploader: undefined,
        webpageUrl: 'https://www.facebook.com/watch?v=123',
      })
    );
    expect(result).toBe('AuthorName');
  });

  it('guesses author from "Reel by" title', () => {
    const result = normalizeArtist(
      social({
        title: 'Reel by SomeUser',
        metascraper: { author: 'Instagram' },
        uploader: undefined,
        webpageUrl: 'https://www.instagram.com/reel/123',
      })
    );
    expect(result).toBe('SomeUser');
  });

  it('falls back to platform name when everything is empty', () => {
    const result = normalizeArtist(
      social({
        title: '',
        uploader: undefined,
        webpageUrl: 'https://www.tiktok.com/@user/video/123',
      })
    );
    expect(result).toBe('TikTok');
  });

  it('prefers YouTube uploader fields without title heuristics', () => {
    const result = normalizeArtist(
      social({
        title: 'MrBeast | YouTube',
        uploader: 'MrBeast',
        webpageUrl: 'https://www.youtube.com/watch?v=abc',
      })
    );
    expect(result).toBe('MrBeast');
  });

  it('rejects YT handle-like slugs', () => {
    const result = normalizeArtist(
      social({
        uploader: 'mrbeast-abc123',
        channel: 'MrBeast',
        webpageUrl: 'https://www.youtube.com/watch?v=abc',
      })
    );
    expect(result).toBe('MrBeast');
  });

  it('uses "YouTube User" when all YT candidates are empty', () => {
    const result = normalizeArtist(
      social({
        uploader: undefined,
        author: undefined,
        channel: undefined,
        creator: undefined,
        webpageUrl: 'https://www.youtube.com/watch?v=abc',
      })
    );
    expect(result).toBe('YouTube User');
  });
});

describe('normalizeTitle', () => {
  it('returns a clean title when available', () => {
    expect(normalizeTitle(social({ title: 'Great Content' }))).toBe(
      'Great Content'
    );
  });

  it('strips social metrics from title', () => {
    const result = normalizeTitle(
      social({ title: '2.5K views · Some Video · Author' })
    );
    expect(result).not.toContain('views');
  });

  it('strips hashtags from short titles', () => {
    const result = normalizeTitle(
      social({ title: 'Cool clip #viral #trending' })
    );
    expect(result).not.toContain('#');
  });

  it('replaces generic titles with fallback from description', () => {
    const result = normalizeTitle(
      social({
        title: 'Video',
        description: 'This is the actual description',
      })
    );
    expect(result).toBe('This is the actual description');
  });

  it('strips "Reel by Author" patterns', () => {
    const result = normalizeTitle(
      social({
        title: 'Reel by SomeUser | Cool Content | Facebook',
        metascraper: { title: 'Reel by SomeUser | Cool Content | Facebook' },
        webpageUrl: 'https://www.facebook.com/reel/123',
      })
    );
    expect(result).not.toContain('Reel by');
    expect(result).not.toContain('Facebook');
  });

  it('prefers metascraper title and filters platform noise', () => {
    const result = normalizeTitle(
      social({
        title: 'fallback',
        metascraper: { title: 'Cool Post | Author | Facebook' },
        uploader: 'Author',
        webpageUrl: 'https://www.facebook.com/watch?v=123',
      })
    );
    expect(result).toBe('Cool Post');
    expect(result).not.toContain('Facebook');
  });

  it('uses alt_title for generic "Video by" titles', () => {
    const result = normalizeTitle(
      social({ title: 'Video by X', alt_title: 'Better Title' })
    );
    expect(result).toBe('Better Title');
  });

  it('falls back to uploader when title is empty', () => {
    const result = normalizeTitle(social({ title: '', id: '12345' }));
    // normalizeTitle prefers uploader over Video_id fallback
    expect(result).toBe('TestUser');
  });

  it('falls back to uploader when both title and id are empty', () => {
    const result = normalizeTitle(social({ title: '' }));
    expect(result).toBe('TestUser');
  });

  it('rejects junk engagement-only titles', () => {
    const result = normalizeTitle(
      social({
        title: '1.2K reactions',
        uploader: 'RealUser',
      })
    );
    // should fall back to author or Video_timestamp
    expect(result).not.toContain('reactions');
  });

  it('purges author prefix from title', () => {
    const result = normalizeTitle(
      social({
        title: 'MrBeast: Epic Challenge',
        uploader: 'MrBeast',
      })
    );
    expect(result).toBe('Epic Challenge');
  });
});
