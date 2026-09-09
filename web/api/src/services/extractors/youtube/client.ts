import { Innertube, Platform } from 'youtubei.js';
import { logger } from '../../../utils/infra/logger.util.js';
import vm from 'node:vm';

let cachedClient: Innertube | null = null;
let clientCreatedAt = 0;

// recreate client past this age
const CLIENT_TTL_MS =
  Number(process.env.YOUTUBE_CLIENT_TTL_MS) || 4 * 60 * 60 * 1000;

// youtube rotates cipher; client goes stale
export function isClientStale(
  createdAt: number,
  now: number = Date.now(),
  ttl: number = CLIENT_TTL_MS
): boolean {
  return createdAt === 0 || now - createdAt >= ttl;
}

 // platform setup loopback bypass
const setupPlatform = () => {
  if (Platform.shim) {
    /* eslint-disable @typescript-eslint/no-explicit-any, sonarjs/code-eval */
    Platform.shim.eval = (data: any, env: any) => {
      // function wrapper
      const fn = vm.runInNewContext(
        `(function(${Object.keys(env).join(', ')}) { ${data.output} })`,
        {}
      );
      return fn(...Object.values(env));
    };
    /* eslint-enable @typescript-eslint/no-explicit-any, sonarjs/code-eval */
  }
};

setupPlatform();

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const _createInnertube = async (config?: any): Promise<Innertube> => {
  setupPlatform();
  return await Innertube.create({
    generate_session_locally: true,
    enable_safety_mode: false,
    // prevent jit stalls
    enable_jit_fallback: false,
    ...config,
  });
};

export async function getYoutubeClient(): Promise<Innertube> {
  if (cachedClient && !isClientStale(clientCreatedAt)) return cachedClient;

  try {
    cachedClient = await _createInnertube();
    clientCreatedAt = Date.now();
    return cachedClient;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[YouTubeClient] Init failed: ${message}`);
    throw error;
  }
}

/*
* extraction client armed w/ poToken so ANDROID_VR returns real urls
* kept separate from search client above
*/
let extractorClient: Innertube | null = null;
let extractorCreatedAt = 0;
let extractorPoToken: string | null = null;

// on by default; YT_POTOKEN=0 to disable
const POTOKEN_ENABLED = process.env.YT_POTOKEN !== '0';

// account cookie replaces anonymous potoken
const YT_COOKIE = process.env.YT_COOKIE?.trim() || '';

export async function getYoutubeExtractorClient(): Promise<Innertube> {
  if (YT_COOKIE) {
    const fresh =
      extractorClient &&
      extractorPoToken === 'cookie' &&
      !isClientStale(extractorCreatedAt);
    if (fresh && extractorClient) return extractorClient;
    extractorClient = await _createInnertube({ cookie: YT_COOKIE });
    extractorCreatedAt = Date.now();
    extractorPoToken = 'cookie';
    return extractorClient;
  }

  let poToken: string | undefined;
  let visitorData: string | undefined;

  if (POTOKEN_ENABLED) {
    const { getPoToken } = await import('./potoken.js');
    const bundle = await getPoToken();
    poToken = bundle?.poToken;
    visitorData = bundle?.visitorData;
  }

  const reusable =
    extractorClient &&
    extractorPoToken === (poToken ?? null) &&
    !isClientStale(extractorCreatedAt);
  if (reusable && extractorClient) return extractorClient;

  extractorClient = await _createInnertube({
    po_token: poToken,
    visitor_data: visitorData,
  });
  extractorCreatedAt = Date.now();
  extractorPoToken = poToken ?? null;
  return extractorClient;
}
