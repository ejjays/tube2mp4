import {
  VideoInfo,
  Format,
  ExtractorError,
  getExtractor as pkgGetExtractor,
  createBilibiliExtractor,
} from '@phantom/extractors';
import { getInfo as youtubeGetInfo } from './youtube';
import { getInfo as instagramGetInfo } from './instagram';
import { getInfo as spotifyGetInfo } from './spotify';
import { getInfo as soundcloudGetInfo } from './soundcloud';
import { getCachedInfo, setCachedInfo } from '../lib/cache';
import { reportError } from '../lib/crash';
import { log } from '../lib/log';
import { mapLimit } from '../lib/net';
import { getGenericSnifferEnabled } from '../lib/settings';
import { getBilibiliCookie } from '../lib/settings';
import { extractFromPage } from '../lib/webviewExtraction/host';
import { pageScanToVideoInfo } from '../lib/webviewExtraction/normalize';
import { probeFileSize } from './shared/utils';
import { mobileSharedEnvWithThumbs } from './shared/env';

export type OnPartial = (info: VideoInfo) => void;

function hostOf(url: string): string {
  const cleaned = url.replace(/^https?:\/\//iu, '');
  return cleaned.split(/[/?#]/u)[0].toLowerCase();
}

function matches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

// only these keep on-device paths — WebView BotGuard (youtube), native
// login (instagram), isrc/drm fallbacks (spotify, soundcloud) and the
// cookie-injected bilibili client. everything else comes from the shared
// package registry, so a new platform added there works here for free.
async function dispatch(
  host: string,
  url: string,
  onPartial?: OnPartial
): Promise<VideoInfo | null> {
  if (matches(host, 'youtube.com') || matches(host, 'youtu.be')) {
    return youtubeGetInfo(url, onPartial);
  }

  if (matches(host, 'spotify.com')) {
    return spotifyGetInfo(url, onPartial);
  }

  if (matches(host, 'soundcloud.com')) {
    return soundcloudGetInfo(url, onPartial);
  }

  if (matches(host, 'instagram.com')) {
    return instagramGetInfo(url);
  }

  if (
    matches(host, 'bilibili.tv') ||
    matches(host, 'biliintl.com') ||
    matches(host, 'bili.im')
  ) {
    const cookie = await getBilibiliCookie();
    const env = cookie
      ? { ...mobileSharedEnvWithThumbs, cookie }
      : mobileSharedEnvWithThumbs;
    return createBilibiliExtractor(env).getInfo(url);
  }

  const pkg = pkgGetExtractor(url, mobileSharedEnvWithThumbs);
  if (pkg) return pkg.getInfo(url, onPartial ? { onPartial } : {});

  return null;
}

const FAST_RESOLVE_DISABLED =
  process.env.EXPO_PUBLIC_DISABLE_FAST_RESOLVE === '1';

// native paths win for these (PO-token, audio-only) — skip the webview scan
const WEBVIEW_GUARDED = [
  'youtube.com',
  'youtu.be',
  'spotify.com',
  'soundcloud.com',
];

function webviewGuarded(host: string): boolean {
  return WEBVIEW_GUARDED.some((domain) => matches(host, domain));
}

// expected fails (private/removed/geo/login) & client drops aren't our bug
function reportFailure(host: string, error: unknown): void {
  if (error instanceof ExtractorError && error.expected) return;
  reportError(
    error,
    { host },
    {
      kind: 'extractor_failure',
      host,
      retryable: String(error instanceof ExtractorError && error.retryable),
    }
  );
}

export async function resolve(
  url: string,
  onPartial?: OnPartial,
  options?: { fresh?: boolean }
): Promise<VideoInfo | null> {
  const host = hostOf(url);

  if (!FAST_RESOLVE_DISABLED && !options?.fresh) {
    const cached = getCachedInfo(url);
    if (cached) return cached;
  }

  const partialSink = FAST_RESOLVE_DISABLED ? undefined : onPartial;

  let info: VideoInfo | null = null;
  let originalError: unknown = null;
  try {
    info = await dispatch(host, url, partialSink);
  } catch (error) {
    originalError = error;
    if (webviewGuarded(host) || !(error instanceof ExtractorError)) {
      reportFailure(host, error);
      throw error;
    }
  }

  // generic webview DOM scan; opt-in flag, 30s scan that finds nothing > instant fail
  if (!info && !webviewGuarded(host) && !(await getGenericSnifferEnabled())) {
    if (originalError !== null) {
      reportFailure(host, originalError);
      throw originalError;
    }
    return null;
  }

  if (!info && !webviewGuarded(host)) {
    log(
      'Resolve',
      'webview fallback',
      url,
      originalError ? `after error: ${originalError}` : '(unknown host)'
    );
    const scan = await extractFromPage(url, (scan) => {
      const partial = pageScanToVideoInfo(scan, host, true);
      if (partial) partialSink?.(partial);
    });
    info = scan ? pageScanToVideoInfo(scan, host, false) : null;
    if (info && !info.isPartial && info.formats.length > 0) {
      const headers = info.downloadHeaders ?? {};
      await mapLimit(info.formats, 2, async (format) => {
        if (!format.url || format.filesize || format.isHls) return;
        const size = await probeFileSize(format.url, headers);
        if (size) format.filesize = size;
      });
      const sizeLabel = (format: Format): string =>
        format.filesize
          ? `${Math.round(format.filesize / 1024 / 1024)}MB`
          : '?size';
      log(
        'Resolve',
        'webview info',
        info.title,
        '|',
        info.formats.map(
          (format) => `${format.extension} ${sizeLabel(format)} @ ${format.url}`
        )
      );
    }
    if (!info && originalError !== null) {
      reportFailure(host, originalError);
      throw originalError;
    }
  }

  if (
    !FAST_RESOLVE_DISABLED &&
    info &&
    !info.isPartial &&
    info.formats.length > 0
  ) {
    setCachedInfo(url, info);
  }
  return info;
}
