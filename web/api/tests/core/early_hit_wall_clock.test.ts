import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ensure metrics don't leak to UI

vi.mock('../../src/utils/media/metadata.util.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/utils/media/metadata.util.js')
    >();
  return {
    ...actual,
    fetchYoutubeOEmbed: vi.fn().mockResolvedValue({
      title: 'Wall-Clock Test',
      author: 'Backend Logger',
      image: 'https://thumb.jpg',
      publisher: 'YouTube',
      url: 'https://www.youtube.com/watch?v=earlyHitT01',
    }),
    fetchMetadata: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../../src/services/extractors/youtube/index.js', () => ({
  // prioritize oembed fast path
  getInfo: vi.fn(
    () => new Promise((resolve) => setTimeout(() => resolve(null), 500))
  ),
  getStream: vi.fn(),
}));

import { getInfo } from '../../src/services/extractors/index.js';
import { logger } from '../../src/utils/infra/logger.util.js';

describe('[Metadata] Early hit — backend wall-clock metric', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('appends "wall-clock Nms" to backend log when requestT0 is provided', async () => {
    const onProgress = vi.fn();
    const requestT0 = Date.now() - 1500;

    await getInfo('https://www.youtube.com/watch?v=earlyHitT01', {
      onProgress,
      requestT0,
    });

    // wait for async logs
    await new Promise((resolve) => setTimeout(resolve, 50));

    const earlyHitLog = logSpy.mock.calls.find(
      ([msg]) =>
        typeof msg === 'string' && msg.startsWith('[Metadata] Early hit:')
    );
    expect(earlyHitLog).toBeDefined();
    expect(earlyHitLog?.[0]).toMatch(/wall-clock \d+ms/);
  });

  it('omits "wall-clock" when requestT0 is not provided', async () => {
    const onProgress = vi.fn();

    await getInfo('https://www.youtube.com/watch?v=earlyHitT02', {
      onProgress,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const earlyHitLog = logSpy.mock.calls.find(
      ([msg]) =>
        typeof msg === 'string' && msg.startsWith('[Metadata] Early hit:')
    );
    expect(earlyHitLog).toBeDefined();
    expect(earlyHitLog?.[0]).not.toMatch(/wall-clock/u);
  });

  it('does not leak wall-clock or requestT0 into SSE early_metadata payload', async () => {
    const onProgress = vi.fn();
    const requestT0 = Date.now() - 2500;

    await getInfo('https://www.youtube.com/watch?v=earlyHitT03', {
      onProgress,
      requestT0,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const sseCall = onProgress.mock.calls.find(
      ([status, , subStatus]) =>
        status === 'extracting' && subStatus === 'Metadata found'
    );
    expect(sseCall).toBeDefined();

    const detailsJson = sseCall?.[3] as string;
    expect(typeof detailsJson).toBe('string');
    // prevent internal metrics in SSE
    expect(detailsJson).not.toContain('wall-clock');
    expect(detailsJson).not.toContain('wallClock');
    expect(detailsJson).not.toContain('requestT0');

    const parsed = JSON.parse(detailsJson) as {
      early_metadata?: Record<string, unknown>;
    };
    expect(parsed.early_metadata).toBeDefined();
    expect(parsed.early_metadata).not.toHaveProperty('wallClockMs');
    expect(parsed.early_metadata).not.toHaveProperty('requestT0');
  });
});
