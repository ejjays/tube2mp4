import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/net', () => ({
  gatedFetch: vi.fn(),
}));

import { gatedFetch } from '../src/lib/net';
import { createSnapchatExtractor, parseSpotlightId } from '@phantom/extractors';
import { mobileSharedEnv } from '../src/extractors/shared/env';

const getInfo = (url: string) =>
  createSnapchatExtractor(mobileSharedEnv).getInfo(url);

const mockFetch = vi.mocked(gatedFetch);

function _jsonRes(body: unknown, ok = true, status?: number): Response {
  return {
    ok,
    status: status ?? (ok ? 200 : 403),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function htmlRes(html: string, ok = true, status?: number): Response {
  return {
    ok,
    status: status ?? (ok ? 200 : 403),
    url: 'https://www.snapchat.com/spotlight/abc',
    text: () => Promise.resolve(html),
    json: () => Promise.reject(new Error('not json')),
  } as unknown as Response;
}

const TARGET_ID = 'W7_EDlXWTBiXAEEniNoMPwAAYYWtidGhudGZpAX1TKn0JAX1TKnXJAAAAAA';

const VIDEO_META = {
  name: 'Views 💕',
  description: 'Another Spotlight Snap brought to you by Snapchat',
  thumbnailUrl: 'https://cf-st.sc-cdn.net/d/kKJHIR1QAznRKK9jgYYDq.256.IRZXSOY',
  contentUrl:
    'https://cf-st.sc-cdn.net/d/kKJHIR1QAznRKK9jgYYDq.1034.IRZXSOY?mo=foo&uc=46',
  width: 540,
  height: 960,
  durationMs: '4665',
};

function buildHtml(
  id: string,
  meta: Record<string, unknown>,
  extraMeta: Record<string, unknown> = {},
  ogUrl?: string
): string {
  const next = {
    props: {
      pageProps: {
        spotlightFeed: {
          spotlightStories: [
            {
              story: { storyId: { value: id } },
              metadata: { videoMetadata: meta, ...extraMeta },
            },
            {
              story: { storyId: { value: 'OTHER_ID_xxxxxxxxxxxxx' } },
              metadata: { videoMetadata: { ...meta, name: 'other clip' } },
            },
          ],
        },
      },
    },
  };
  const og = ogUrl ? `<meta property="og:url" content="${ogUrl}">` : '';
  return `<!doctype html><html><head>${og}<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script></head><body></body></html>`;
}

describe('snapchat parseSpotlightId', () => {
  it('parses spotlight ids from canonical and profile forms', () => {
    expect(
      parseSpotlightId(`https://www.snapchat.com/spotlight/${TARGET_ID}`)
    ).toBe(TARGET_ID);
    expect(
      parseSpotlightId(
        `https://www.snapchat.com/@creator/spotlight/${TARGET_ID}?foo=bar`
      )
    ).toBe(TARGET_ID);
    expect(parseSpotlightId('https://www.snapchat.com/add/foo')).toBeNull();
  });
});

describe('snapchat getInfo', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('parses a public spotlight page into a single mp4 format', async () => {
    const meta = {
      ...VIDEO_META,
      creator: {
        $case: 'personCreator',
        personCreator: { username: 'shreypatel57', name: 'Shrey Patel' },
      },
    };
    mockFetch.mockResolvedValueOnce(htmlRes(buildHtml(TARGET_ID, meta)));

    const info = await getInfo(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
    expect(info?.extractorKey).toBe('snapchat');
    expect(info?.id).toBe(TARGET_ID);
    expect(info?.title).toBe('Views 💕');
    expect(info?.uploader).toBe('Shrey Patel');
    expect(info?.duration).toBe(5);
    expect(info?.thumbnail).toContain('256.IRZXSOY');
    expect(info?.formats).toHaveLength(1);

    const top = info?.formats[0];
    expect(top?.extension).toBe('mp4');
    expect(top?.url).toContain('sc-cdn.net');
    expect(top?.width).toBe(540);
    expect(top?.height).toBe(960);
    expect(top?.quality).toBe('960p');
    expect(top?.isMuxed).toBe(true);
    expect(info?.downloadHeaders?.Referer).toBe('https://www.snapchat.com/');
  });

  it('derives the uploader from og:url when creator is null (platform-posted clip)', async () => {
    const meta = { ...VIDEO_META, creator: null, width: 0, height: 0 };
    mockFetch.mockResolvedValueOnce(
      htmlRes(
        buildHtml(
          TARGET_ID,
          meta,
          {},
          `https://www.snapchat.com/@snapchat/spotlight/${TARGET_ID}`
        )
      )
    );

    const info = await getInfo(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
    expect(info?.uploader).toBe('snapchat');
    expect(info?.title).toBe('Views 💕');
    expect(info?.formats).toHaveLength(1);
    expect(info?.formats[0]?.formatId).toBe('source');
    expect(info?.formats[0]?.width).toBeUndefined();
    expect(info?.formats[0]?.height).toBeUndefined();
  });

  it('follows t.snapchat.com short links via redirect', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (/t\.snapchat\.com/u.test(url)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          url: `https://www.snapchat.com/spotlight/${TARGET_ID}`,
          text: () => Promise.resolve(''),
        } as unknown as Response);
      }
      return Promise.resolve(htmlRes(buildHtml(TARGET_ID, VIDEO_META)));
    });

    const info = await getInfo(`https://t.snapchat.com/${TARGET_ID.slice(0, 6)}`);
    expect(info?.id).toBe(TARGET_ID);
    expect(info?.webpageUrl).toBe(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
  });

  it('falls back to the creator name when the only title is the generic "Spotlight Snap"', async () => {
    const meta = {
      ...VIDEO_META,
      name: 'Spotlight Snap',
      description: '',
      embeddedTextCaption: '',
      creator: {
        $case: 'personCreator',
        personCreator: {
          username: 'pasqualetuzzy',
          name: 'Pasquale Tuzzolino',
          url: 'https://www.snapchat.com/@pasqualetuzzy',
        },
      },
    };
    mockFetch.mockResolvedValueOnce(htmlRes(buildHtml(TARGET_ID, meta)));
    const info = await getInfo(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
    expect(info?.title).toBe('Pasquale Tuzzolino');
    expect(info?.uploader).toBe('Pasquale Tuzzolino');
  });

  it('uses the description when name is generic and description has real words', async () => {
    const meta = {
      ...VIDEO_META,
      name: 'Spotlight Snap',
      description: 'a short real description',
      embeddedTextCaption: '',
      creator: {
        $case: 'personCreator',
        personCreator: { username: 'pasqualetuzzy', name: 'Pasquale Tuzzolino' },
      },
    };
    mockFetch.mockResolvedValueOnce(htmlRes(buildHtml(TARGET_ID, meta)));
    const info = await getInfo(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
    expect(info?.title).toBe('a short real description');
  });

  it('skips hashtag-only description and falls back to creator', async () => {
    const meta = {
      ...VIDEO_META,
      name: 'Spotlight Snap',
      description: '#viral #relatable #fyp',
      embeddedTextCaption: '',
      creator: {
        $case: 'personCreator',
        personCreator: { username: 'ife_rules', name: '©ØMRADE' },
      },
    };
    mockFetch.mockResolvedValueOnce(htmlRes(buildHtml(TARGET_ID, meta)));
    const info = await getInfo(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
    expect(info?.title).toBe('©ØMRADE');
  });

  it('prefers snap\'s ai-generated llmTitle over everything else', async () => {
    const meta = {
      ...VIDEO_META,
      name: 'Spotlight Snap',
      description: '#viral #relatable #fyp',
      embeddedTextCaption: '',
      creator: {
        $case: 'personCreator',
        personCreator: { username: 'ife_rules', name: '©ØMRADE' },
      },
    };
    mockFetch.mockResolvedValueOnce(
      htmlRes(
        buildHtml(TARGET_ID, meta as unknown as Record<string, unknown>, {
          llmTitle: 'POV: Your Presentation Just Got Interrupted by a Chair',
        })
      )
    );
    const info = await getInfo(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
    expect(info?.title).toBe(
      'POV: Your Presentation Just Got Interrupted by a Chair'
    );
  });

  it('accepts a description with real words alongside hashtags', async () => {
    const meta = {
      ...VIDEO_META,
      name: 'Spotlight Snap',
      description:
        'I am running away INSTANTLY 😭🤞 #spotlight #viral #social #skit #relatable',
      embeddedTextCaption: '',
      creator: {
        $case: 'personCreator',
        personCreator: { username: 'pasqualetuzzy', name: 'Pasquale Tuzzolino' },
      },
    };
    mockFetch.mockResolvedValueOnce(htmlRes(buildHtml(TARGET_ID, meta)));
    const info = await getInfo(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
    expect(info?.title).toBe(
      'I am running away INSTANTLY 😭🤞 #spotlight #viral #social #skit #relatable'
    );
  });

  it('falls back to caption when name is the generic placeholder', async () => {
    const meta = {
      ...VIDEO_META,
      name: 'Spotlight Snap',
      description: 'some description',
      embeddedTextCaption: 'That was in 2024 🤣🤣',
    };
    mockFetch.mockResolvedValueOnce(htmlRes(buildHtml(TARGET_ID, meta)));
    const info = await getInfo(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
    expect(info?.title).toBe('That was in 2024 🤣🤣');
  });

  it('uses the creator username when no display name is available', async () => {
    const meta = {
      ...VIDEO_META,
      name: '',
      description: '',
      embeddedTextCaption: '',
      creator: {
        $case: 'personCreator',
        personCreator: { username: 'pasqualetuzzy' },
      },
    };
    mockFetch.mockResolvedValueOnce(htmlRes(buildHtml(TARGET_ID, meta)));
    const info = await getInfo(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
    expect(info?.uploader).toBe('pasqualetuzzy');
  });

  it('falls back to a clean default title when no creator and no text', async () => {
    mockFetch.mockResolvedValueOnce(
      htmlRes(
        buildHtml(TARGET_ID, {
          ...VIDEO_META,
          name: '',
          description: '',
          embeddedTextCaption: '',
        })
      )
    );
    const info = await getInfo(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
    expect(info?.title).toBe('Snapchat Spotlight');
    expect(info?.uploader).toBe('Snapchat');
  });

  it('truncates very long titles at a word boundary', async () => {
    const long = 'a'.repeat(150);
    mockFetch.mockResolvedValueOnce(
      htmlRes(
        buildHtml(TARGET_ID, {
          ...VIDEO_META,
          name: long,
          description: '',
          embeddedTextCaption: '',
        })
      )
    );
    const info = await getInfo(
      `https://www.snapchat.com/spotlight/${TARGET_ID}`
    );
    expect(info?.title.length).toBeLessThanOrEqual(101);
    expect(info?.title.endsWith('…')).toBe(true);
  });

  it('throws noVideo when the requested id is missing from the feed', async () => {
    mockFetch.mockResolvedValueOnce(
      htmlRes(buildHtml(TARGET_ID, VIDEO_META).replace(TARGET_ID, 'SOMETHING_ELSE_xxxxxxxxxxxx'))
    );
    await expect(
      getInfo(`https://www.snapchat.com/spotlight/${TARGET_ID}`)
    ).rejects.toThrow(/couldn't find a downloadable/iu);
  });

  it('throws notFound for a t.snapchat.com link that does not lead to spotlight', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      url: 'https://www.snapchat.com/add/foo',
      text: () => Promise.resolve(''),
    } as unknown as Response);

    await expect(
      getInfo('https://t.snapchat.com/abc123')
    ).rejects.toThrow(/doesn't exist|removed/iu);
  });

  it('refuses a t.snapchat.com link that redirects to story.snapchat.com', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      url: 'https://story.snapchat.com/s/abcdef',
      text: () => Promise.resolve(''),
    } as unknown as Response);

    await expect(
      getInfo('https://t.snapchat.com/abc123')
    ).rejects.toThrow(/doesn't exist|removed/iu);
  });

  it('maps http failures through fromStatus', async () => {
    mockFetch.mockResolvedValueOnce(htmlRes('', false, 404));
    await expect(
      getInfo(`https://www.snapchat.com/spotlight/${TARGET_ID}`)
    ).rejects.toThrow(/doesn't exist|removed/iu);
  });

  it('returns null for a non-snapchat url', async () => {
    const info = await getInfo('https://example.com/spotlight/abc/');
    expect(info).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
