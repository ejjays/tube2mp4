import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * ensures early-hit metadata is stripped from details.
 * prevents raw JSON blobs from polluting terminal logs
 * after payload is lifted to metadata_update.
 */

const sentEvents: Array<{ id: string; event: Record<string, unknown> }> = [];

vi.mock('../../src/utils/network/sse.util.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/utils/network/sse.util.js')
    >();
  return {
    ...actual,
    sendEvent: (id: string, event: Record<string, unknown>) => {
      sentEvents.push({ id, event });
    },
  };
});

/**
 * Mock YouTube extractor to feed deterministic JS info that triggers
 * the early-hit metadata dispatch path.
 */
vi.mock('../../src/services/extractors/youtube/index.js', () => ({
  getInfo: vi.fn().mockResolvedValue({
    id: 'testEarlyHit1',
    title: 'Test Title',
    uploader: 'Test Uploader',
    webpageUrl: 'https://www.youtube.com/watch?v=testEarlyHit1',
    duration: 180,
    formats: [
      {
        formatId: '18',
        url: 'https://cdn.example.com/360',
        extension: 'mp4',
        resolution: '360p',
        height: 360,
        vcodec: 'avc1',
        acodec: 'mp4a',
        isMuxed: true,
        isVideo: true,
        isAudio: false,
      },
    ],
    audioFormats: [],
    extractorKey: 'youtube',
    isJsInfo: true,
  }),
  getStream: vi.fn(),
}));

/**
 * Mock the oEmbed call to return data so the early-hit dispatch fires.
 */
vi.mock('../../src/utils/media/metadata.util.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/utils/media/metadata.util.js')
    >();
  return {
    ...actual,
    fetchYoutubeOEmbed: vi.fn().mockResolvedValue({
      author: 'Real Channel Name',
      description: null,
      image: 'https://i.ytimg.com/vi/testEarlyHit1/hqdefault.jpg',
      logo: null,
      publisher: 'YouTube',
      title: 'Real Title',
      url: 'https://www.youtube.com/watch?v=testEarlyHit1',
    }),
  };
});

let getVideoInfo: typeof import('../../src/services/ytdlp/info.js').getVideoInfo;

beforeAll(async () => {
  ({ getVideoInfo } = await import('../../src/services/ytdlp/info.js'));
});

beforeEach(() => {
  sentEvents.length = 0;
});

describe('reportProgress — early-hit details strip', () => {
  it('lifts early_metadata into metadata_update and clears details on the SSE event', async () => {
    await getVideoInfo(
      'https://www.youtube.com/watch?v=testEarlyHit1',
      [],
      false,
      null,
      'early-hit-test-client'
    );

    // filter meta events
    const metaEvents = sentEvents.filter(
      (entry) =>
        entry.id === 'early-hit-test-client' &&
        Object.prototype.hasOwnProperty.call(entry.event, 'metadata_update')
    );
    expect(metaEvents.length).toBeGreaterThan(0);

    for (const { event } of metaEvents) {
      // payload lifted
      expect(event.metadata_update).toBeDefined();

      // no json leak
      const details = event.details;
      if (typeof details === 'string') {
        expect(details).not.toContain('"early_metadata"');
        expect(details).not.toMatch(/^\{.*\}$/u);
      }
    }
  });

  it('does not include "early_metadata" as a raw string in ANY event', async () => {
    await getVideoInfo(
      'https://www.youtube.com/watch?v=testEarlyHit1',
      [],
      false,
      null,
      'early-hit-strip-2'
    );

    const leakedEvents = sentEvents.filter(
      (entry) =>
        entry.id === 'early-hit-strip-2' &&
        typeof entry.event.details === 'string' &&
        (entry.event.details as string).includes('early_metadata')
    );

    expect(leakedEvents).toEqual([]);
  });
});
