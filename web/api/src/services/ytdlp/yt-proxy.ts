import { isHost } from '../../utils/network/host.util.js';
import {
  ProxyAgent,
  Agent,
  setGlobalDispatcher,
  type Dispatcher,
} from 'undici';
import { logger } from '../../utils/infra/logger.util.js';

// experimental: route yt egress via residential proxy (YT_PROXY)
export const YT_PROXY = process.env.YT_PROXY?.trim() || '';

const PROXY_ALL = process.env.YT_PROXY_ALL === '1';

export function isYouTubeUrl(url?: string): boolean {
  if (typeof url !== 'string' || !url) return false;
  return isHost(url, 'youtube.com') || isHost(url, 'youtu.be');
}

export function shouldProxyUrl(url?: string): boolean {
  if (!YT_PROXY) return false;
  return PROXY_ALL || isYouTubeUrl(url);
}

// --proxy args; youtube-only unless YT_PROXY_ALL
export function ytProxyArgs(url?: string): string[] {
  if (!YT_PROXY) return [];
  if (!PROXY_ALL && url !== undefined && !isYouTubeUrl(url)) return [];
  return ['--proxy', YT_PROXY];
}

let dispatcherResolved = false;
let cachedDispatcher: Dispatcher | undefined;

// dispatcher for chunked media
export function ytProxyDispatcher(): Dispatcher | undefined {
  if (!YT_PROXY) return undefined;
  if (!dispatcherResolved) {
    dispatcherResolved = true;
    if (/^https?:\/\//u.test(YT_PROXY)) {
      cachedDispatcher = new ProxyAgent(YT_PROXY);
    } else {
      // undici needs http(s) proxy
      logger.warn(
        `[YT_PROXY] media fetch needs http(s) proxy; got ${YT_PROXY.split('://')[0]}://`
      );
    }
  }
  return cachedDispatcher;
}

// hosts that need the residential ip
const YT_PROXY_HOSTS =
  /(?:^|\.)(?:youtube\.com|youtubei\.googleapis\.com|jnn-pa\.googleapis\.com)$/u;

let proxyInstalled = false;

function originHost(origin: string | URL | undefined): string {
  if (!origin) return '';
  try {
    return new URL(typeof origin === 'string' ? origin : origin.href).hostname;
  } catch {
    return '';
  }
}

// only youtube apis use the proxy
export function installYtProxy(): void {
  if (proxyInstalled || !YT_PROXY) return;
  if (!/^https?:\/\//u.test(YT_PROXY)) {
    logger.warn('[YT_PROXY] needs an http(s) proxy url; skipping');
    return;
  }
  proxyInstalled = true;
  // residential proxies are slow to establish
  const proxy = new ProxyAgent({ uri: YT_PROXY, connect: { timeout: 30_000 } });
  const routed = new Agent().compose(
    (dispatch) =>
      (
        opts: Dispatcher.DispatchOptions,
        handler: Dispatcher.DispatchHandler
      ): boolean =>
        YT_PROXY_HOSTS.test(originHost(opts.origin))
          ? proxy.dispatch(opts, handler)
          : dispatch(opts, handler)
  );
  setGlobalDispatcher(routed);
  logger.info('[YT_PROXY] residential routing installed (youtube only)');
}
