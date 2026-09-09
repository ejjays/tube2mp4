import { describe, it, expect, vi } from 'vitest';
import { getVideoInfo } from '../../src/services/ytdlp/info.js';
import { VideoInfo } from '../../src/types/index.js';

// bypass mocks
vi.unmock('youtubei.js');
vi.unmock('msw');
vi.unmock('got');

describe('youtube orchestrator: real benchmark', () => {
  const TEST_URL = 'https://www.youtube.com/watch?v=hVvEISFw9w0'; // morocco 8k

  it('should benchmark the full extraction pipeline', async () => {
    console.log(`\n[Benchmark] Starting full run for: ${TEST_URL}`);

    const startTime = Date.now();

    try {
      // get video info
      const info = (await getVideoInfo(
        TEST_URL,
        [],
        false,
        null,
        'benchmark-id'
      )) as VideoInfo;

      const totalTime = (Date.now() - startTime) / 1000;
      console.log(`\n[Benchmark] COMPLETED in ${totalTime.toFixed(2)}s`);
      console.log(
        `[Benchmark] Final Result: ${info.title} by ${info.uploader}`
      );
      console.log(`[Benchmark] Extractor Key: ${info.extractorKey}`);
      console.log(`[Benchmark] Is Partial: ${info.isPartial}`);
      console.log(`[Benchmark] Formats: ${info.formats?.length || 0}`);

      // verify fast delivery
      console.log(
        `[Benchmark] Metadata delivery speed: ${totalTime.toFixed(2)}s`
      );
      if (totalTime > 6) {
        console.warn(
          `[Benchmark] WARNING: Fast-path was slow (${totalTime.toFixed(2)}s)`
        );
      }

      if (info.isPartial) {
        console.log(
          '[Benchmark] Partial data received, waiting for background task...'
        );
        // wait for background
        await new Promise((resolve) => setTimeout(resolve, 35000));
      }

      // get full cache
      const finalInfo = (await getVideoInfo(
        TEST_URL,
        [],
        false,
        null,
        'benchmark-id-final'
      )) as VideoInfo;
      console.log(
        `[Benchmark] Final format count: ${finalInfo.formats?.length}`
      );

      const resolutions = finalInfo.formats.map((fmt) => fmt.resolution);
      console.log(
        '[Benchmark] Detected Resolutions:',
        resolutions.slice(0, 15)
      );

      const has4K = finalInfo.formats.some(
        (fmt) => fmt.height && fmt.height >= 2160
      );
      const has1080p = finalInfo.formats.some(
        (fmt) => fmt.height && fmt.height >= 1080
      );
      const has8K = finalInfo.formats.some(
        (fmt) => fmt.height && fmt.height >= 4320
      );

      console.log(`[Benchmark] 8K Support: ${has8K ? '✅' : '❌'}`);
      console.log(`[Benchmark] 4K Support: ${has4K ? '✅' : '❌'}`);
      console.log(`[Benchmark] 1080p Support: ${has1080p ? '✅' : '❌'}`);

      // verify ui unstuck
      expect(finalInfo.formats.length).toBeGreaterThan(0);
      expect(finalInfo.isPartial).toBe(false); // must be false
      expect(finalInfo.isFullData).toBe(true);
      expect(has1080p).toBe(true);
    } catch (err) {
      console.error(`[Benchmark] FAILED: ${err}`);
      throw err;
    }
  }, 180000);
});
