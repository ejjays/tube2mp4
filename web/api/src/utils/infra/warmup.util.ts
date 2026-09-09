import { installYtProxy } from '../../services/ytdlp/yt-proxy.js';
import { logger } from './logger.util.js';

// avoid first-request innertube latency
export async function warmYoutubeClient(): Promise<void> {
  if (process.env.DISABLE_YT_JS === '1') {
    logger.info('[Warmup] Innertube skipped (DISABLE_YT_JS set)');
    return;
  }
  const warmStart = Date.now();
  const { getYoutubeClient, getYoutubeExtractorClient } = await import(
    '../../services/extractors/youtube/client.js'
  );
  // proxy flaky at boot; retry warmup
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await Promise.all([getYoutubeClient(), getYoutubeExtractorClient()]);
      logger.info(
        `[Warmup] Innertube client ready in ${Date.now() - warmStart}ms`
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= maxAttempts) {
        logger.warn(
          `[Warmup] pre-warm failed after ${attempt} tries (retries on first request): ${message}`
        );
        return;
      }
      logger.warn(
        `[Warmup] pre-warm attempt ${attempt} failed (${message}); retrying`
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
}

// avoid first-request lazy-load delay
export async function warmHotPathModules(): Promise<void> {
  const warmStart = Date.now();
  try {
    await Promise.all([
      import('../../services/extractors/index.js'),
      import('../api/response.util.js'),
      import('../../services/ytdlp/config.js'),
      import('../network/cookie.util.js'),
    ]);
    logger.info(
      `[Warmup] Hot-path modules ready in ${Date.now() - warmStart}ms`
    );
  } catch (error) {
    logger.warn(
      '[Warmup] Hot-path module prewarm failed:',
      error instanceof Error ? error.message : error
    );
  }
}

// warm caches at boot
export function warmUp(): void {
  installYtProxy();
  void warmYoutubeClient();
  void warmHotPathModules();
}
