import { Extractor, VideoInfo } from './types.js';
import { ExtractorEnv, defaultEnv } from './env.js';
import { createXExtractor } from '../x.js';
import { createBlueskyExtractor } from '../bluesky.js';
import { createVimeoExtractor } from '../vimeo.js';
import { createDailymotionExtractor } from '../dailymotion.js';
import {
  createPinterestExtractor,
  isPinterestHost,
} from '../pinterest.js';
import { createRedditExtractor } from '../reddit.js';
import { createSnapchatExtractor } from '../snapchat.js';
import { createTwitchExtractor } from '../twitch.js';
import { createSoundCloudExtractor } from '../soundcloud.js';
import { createBilibiliExtractor } from '../bilibili.js';
import { createFacebookExtractor } from '../facebook/index.js';
import { createThreadsExtractor } from '../threads/index.js';
import { createTikTokExtractor } from '../tiktok.js';
import { createInstagramExtractor } from '../instagram/index.js';

function hostOf(url: string): string {
  const cleaned = url.replace(/^https?:\/\//iu, '');
  return cleaned.split(/[/?#]/u)[0].toLowerCase();
}

function matches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

interface Route {
  domains: string[];
  // for hosts a plain suffix match can't express (multi-TLD ccTLDs)
  test?: (url: string) => boolean;
  create: (env: ExtractorEnv) => Extractor;
}

const ROUTES: Route[] = [
  { domains: ['x.com', 'twitter.com'], create: createXExtractor },
  { domains: ['bsky.app'], create: createBlueskyExtractor },
  { domains: ['vimeo.com'], create: createVimeoExtractor },
  { domains: ['dailymotion.com', 'dai.ly'], create: createDailymotionExtractor },
  {
    domains: ['pinterest.com', 'pinterest.co.uk', 'pin.it'],
    test: isPinterestHost,
    create: createPinterestExtractor,
  },
  { domains: ['reddit.com', 'redd.it', 'old.reddit.com'], create: createRedditExtractor },
  { domains: ['snapchat.com', 't.snapchat.com', 'story.snapchat.com'], create: createSnapchatExtractor },
  { domains: ['twitch.tv', 'clip.twitch.tv'], create: createTwitchExtractor },
  { domains: ['soundcloud.com', 'on.soundcloud.com'], create: createSoundCloudExtractor },
  { domains: ['bilibili.tv', 'bilibili.com', 'biliintl.com', 'bili.im'], create: createBilibiliExtractor },
  { domains: ['facebook.com', 'fb.watch', 'fb.com'], create: createFacebookExtractor },
  { domains: ['threads.net', 'threads.com'], create: createThreadsExtractor },
  { domains: ['tiktok.com'], create: createTikTokExtractor },
  { domains: ['instagram.com'], create: createInstagramExtractor },
];

// host -> extractor, one env shared across whichever extractor gets picked
export function getExtractor(
  url: string,
  env: ExtractorEnv = defaultEnv
): Extractor | null {
  const host = hostOf(url);
  const route = ROUTES.find(
    (entry) =>
      entry.domains.some((domain) => matches(host, domain)) ||
      entry.test?.(url) === true
  );
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
