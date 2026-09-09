import { Extractor, VideoInfo } from './types.js';
import { ExtractorEnv, defaultEnv } from './env.js';
import { hostOf, matchesDomain } from './host.js';
import { createXExtractor } from '../x.js';
import { createBlueskyExtractor } from '../bluesky.js';
import { createVimeoExtractor } from '../vimeo.js';
import { createDailymotionExtractor } from '../dailymotion.js';
import { createPinterestExtractor, isPinterestHost } from '../pinterest.js';
import { createRedditExtractor } from '../reddit.js';
import { createSnapchatExtractor } from '../snapchat.js';
import { createTwitchExtractor } from '../twitch.js';
import { createSoundCloudExtractor } from '../soundcloud.js';
import { createBilibiliExtractor } from '../bilibili.js';
import { createFacebookExtractor } from '../facebook/index.js';
import { createThreadsExtractor } from '../threads/index.js';
import { createTikTokExtractor } from '../tiktok.js';
import { createInstagramExtractor } from '../instagram/index.js';

interface Route {
  /** stable platform id — metrics/logging key, also exposed via getRouteName() */
  name: string;
  domains: string[];
  // for hosts a plain suffix match can't express (multi-TLD ccTLDs)
  test?: (url: string) => boolean;
  create: (env: ExtractorEnv) => Extractor;
}

const ROUTES: Route[] = [
  {
    name: 'x',
    domains: ['x.com', 'twitter.com'],
    create: createXExtractor,
  },
  { name: 'bluesky', domains: ['bsky.app'], create: createBlueskyExtractor },
  { name: 'vimeo', domains: ['vimeo.com'], create: createVimeoExtractor },
  {
    name: 'dailymotion',
    domains: ['dailymotion.com', 'dai.ly'],
    create: createDailymotionExtractor,
  },
  {
    name: 'pinterest',
    domains: ['pinterest.com', 'pinterest.co.uk', 'pin.it'],
    test: isPinterestHost,
    create: createPinterestExtractor,
  },
  {
    name: 'reddit',
    domains: ['reddit.com', 'redd.it', 'old.reddit.com'],
    create: createRedditExtractor,
  },
  {
    name: 'snapchat',
    domains: ['snapchat.com', 't.snapchat.com', 'story.snapchat.com'],
    create: createSnapchatExtractor,
  },
  {
    name: 'twitch',
    domains: ['twitch.tv', 'clip.twitch.tv'],
    create: createTwitchExtractor,
  },
  {
    name: 'soundcloud',
    domains: ['soundcloud.com', 'on.soundcloud.com'],
    create: createSoundCloudExtractor,
  },
  {
    name: 'bilibili',
    domains: ['bilibili.tv', 'bilibili.com', 'biliintl.com', 'bili.im'],
    create: createBilibiliExtractor,
  },
  {
    name: 'facebook',
    domains: ['facebook.com', 'fb.watch', 'fb.com'],
    create: createFacebookExtractor,
  },
  {
    name: 'threads',
    domains: ['threads.net', 'threads.com'],
    create: createThreadsExtractor,
  },
  { name: 'tiktok', domains: ['tiktok.com'], create: createTikTokExtractor },
  {
    name: 'instagram',
    domains: ['instagram.com'],
    create: createInstagramExtractor,
  },
];

function routeFor(url: string): Route | undefined {
  const host = hostOf(url);
  return ROUTES.find(
    (entry) =>
      entry.domains.some((domain) => matchesDomain(host, domain)) ||
      entry.test?.(url) === true
  );
}

/**
 * Stable platform id for a URL, or null when nothing routes it. Consumers
 * should use this instead of re-deriving a label from the host — a second
 * host list always drifts from this one (misses pinterest.co.uk, fb.com,
 * old.reddit.com, …) and silently degrades per-platform metrics.
 */
export function getRouteName(url: string): string | null {
  return routeFor(url)?.name ?? null;
}

// host -> extractor, one env shared across whichever extractor gets picked
export function getExtractor(
  url: string,
  env: ExtractorEnv = defaultEnv
): Extractor | null {
  const route = routeFor(url);
  return route ? route.create(env) : null;
}

// convenience: getExtractor + getInfo in one call, for when you don't need getStream too
export async function resolve(
  url: string,
  env: ExtractorEnv = defaultEnv
): Promise<VideoInfo | null> {
  const extractor = getExtractor(url, env);
  if (!extractor) return null;
  return extractor.getInfo(url);
}
