import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { fetchYoutubeOEmbed } from '../../src/utils/media/metadata.util.js';

/**
 * Regression tests for the YouTube oEmbed fast-path.
 *
 * fetchYoutubeOEmbed is the early-hit fetcher that replaced the slow
 * (1-3s) metascraper HTML download for YouTube URLs. It must:
 *   1. Return author_name as the channel display name (NOT a URL slug).
 *   2. Build a high-resolution thumbnail URL from the video id.
 *   3. Gracefully return null on any error (401, 404, network) so the
 *      caller falls back to the next strategy instead of crashing.
 *   4. Handle multiple URL forms (youtu.be, /shorts/, /watch?v=).
 */

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchYoutubeOEmbed — happy path', () => {
  it('returns the channel display name (author_name) and title', async () => {
    server.use(
      http.get('https://www.youtube.com/oembed', () =>
        HttpResponse.json({
          title: 'Example Video Title',
          author_name: 'NJM RUI',
          author_url: 'https://www.youtube.com/@nijummd-ru1jz',
          thumbnail_url: 'https://i.ytimg.com/vi/nTbA7qrEsP0/default.jpg',
          provider_name: 'YouTube',
        })
      )
    );

    const meta = await fetchYoutubeOEmbed(
      'https://www.youtube.com/watch?v=nTbA7qrEsP0'
    );

    expect(meta).not.toBeNull();
    expect(meta?.title).toBe('Example Video Title');
    expect(meta?.author).toBe('NJM RUI');
    expect(meta?.publisher).toBe('YouTube');
  });

  it('upgrades the thumbnail URL to hqdefault', async () => {
    server.use(
      http.get('https://www.youtube.com/oembed', () =>
        HttpResponse.json({
          title: 'X',
          author_name: 'Y',
          thumbnail_url: 'https://i.ytimg.com/vi/abcDEF12345/default.jpg',
        })
      )
    );

    const meta = await fetchYoutubeOEmbed('https://youtu.be/abcDEF12345');
    expect(meta?.image).toBe(
      'https://i.ytimg.com/vi/abcDEF12345/hqdefault.jpg'
    );
  });

  it('handles youtu.be short URLs', async () => {
    server.use(
      http.get('https://www.youtube.com/oembed', ({ request }) => {
        const parsed = new URL(request.url);
        const target = parsed.searchParams.get('url');
        expect(target).toContain('youtube.com/watch?v=abcDEF12345');
        return HttpResponse.json({
          title: 'Short URL Test',
          author_name: 'Channel',
        });
      })
    );

    const meta = await fetchYoutubeOEmbed('https://youtu.be/abcDEF12345');
    expect(meta?.title).toBe('Short URL Test');
  });

  it('handles /shorts/ URLs', async () => {
    server.use(
      http.get('https://www.youtube.com/oembed', () =>
        HttpResponse.json({ title: 'Shorts Title', author_name: 'Creator' })
      )
    );

    const meta = await fetchYoutubeOEmbed(
      'https://www.youtube.com/shorts/abcDEF12345'
    );
    expect(meta?.title).toBe('Shorts Title');
  });
});

describe('fetchYoutubeOEmbed — failure modes return null (no throw)', () => {
  it('returns null on 401 Unauthorized (private/unlisted videos)', async () => {
    server.use(
      http.get(
        'https://www.youtube.com/oembed',
        () => new HttpResponse('Unauthorized', { status: 401 })
      )
    );

    const meta = await fetchYoutubeOEmbed(
      'https://www.youtube.com/watch?v=privateXYZ1'
    );
    expect(meta).toBeNull();
  });

  it('returns null on 404 Not Found (deleted videos)', async () => {
    server.use(
      http.get(
        'https://www.youtube.com/oembed',
        () => new HttpResponse('Not Found', { status: 404 })
      )
    );

    const meta = await fetchYoutubeOEmbed(
      'https://www.youtube.com/watch?v=deletedABC1'
    );
    expect(meta).toBeNull();
  });

  it('returns null on network error', async () => {
    server.use(
      http.get('https://www.youtube.com/oembed', () => HttpResponse.error())
    );

    const meta = await fetchYoutubeOEmbed(
      'https://www.youtube.com/watch?v=netfailABC1'
    );
    expect(meta).toBeNull();
  });

  it('returns null when title and author are both missing', async () => {
    server.use(
      http.get('https://www.youtube.com/oembed', () =>
        HttpResponse.json({ provider_name: 'YouTube' })
      )
    );

    const meta = await fetchYoutubeOEmbed(
      'https://www.youtube.com/watch?v=missingXYZ1'
    );
    expect(meta).toBeNull();
  });

  it('returns null when the URL has no extractable video id', async () => {
    const meta = await fetchYoutubeOEmbed(
      'https://www.youtube.com/results?search_query=foo'
    );
    expect(meta).toBeNull();
  });
});

describe('fetchYoutubeOEmbed — partial responses', () => {
  it('keeps title even when author_name is missing', async () => {
    server.use(
      http.get('https://www.youtube.com/oembed', () =>
        HttpResponse.json({ title: 'Only Title Here' })
      )
    );

    const meta = await fetchYoutubeOEmbed(
      'https://www.youtube.com/watch?v=titleOnlyA1'
    );
    expect(meta?.title).toBe('Only Title Here');
    expect(meta?.author).toBeNull();
  });

  it('keeps author when title is missing', async () => {
    server.use(
      http.get('https://www.youtube.com/oembed', () =>
        HttpResponse.json({ author_name: 'Only Author Here' })
      )
    );

    const meta = await fetchYoutubeOEmbed(
      'https://www.youtube.com/watch?v=authorOnlyAB'
    );
    expect(meta?.author).toBe('Only Author Here');
    expect(meta?.title).toBeNull();
  });
});
