import { ExtractorError } from './types.js';

export { ExtractorError };

export function notFound(platform: string, noun = 'video'): ExtractorError {
  return new ExtractorError(
    `This ${platform} ${noun} doesn't exist or was removed.`,
    false,
    true
  );
}
export function privateVideo(platform: string, noun = 'video'): ExtractorError {
  return new ExtractorError(
    `This ${platform} ${noun} is private and can't be downloaded.`,
    false,
    true
  );
}
export function loginRequired(
  platform: string,
  noun = 'video'
): ExtractorError {
  return new ExtractorError(
    `This ${platform} ${noun} needs a login, so it can't be downloaded.`,
    false,
    true
  );
}
export function geoBlocked(platform: string, noun = 'video'): ExtractorError {
  return new ExtractorError(
    `This ${platform} ${noun} isn't available in your region.`,
    false,
    true
  );
}
export function ageRestricted(
  platform: string,
  noun = 'video'
): ExtractorError {
  return new ExtractorError(
    `This ${platform} ${noun} is age-restricted and can't be downloaded.`,
    false,
    true
  );
}
export function restricted(
  platform: string,
  reason?: string,
  noun = 'video'
): ExtractorError {
  const suffix = reason ? ` ${reason}` : '';
  return new ExtractorError(
    `This ${platform} ${noun} is restricted${suffix} and can't be downloaded.`,
    false,
    true
  );
}
export function noVideo(platform: string, noun = 'video'): ExtractorError {
  return new ExtractorError(
    `Couldn't find a downloadable ${noun} at this ${platform} link.`,
    false,
    true
  );
}
export function networkError(platform: string): ExtractorError {
  return new ExtractorError(
    `Couldn't reach ${platform}. Check your connection and try again.`,
    true,
    true
  );
}
export function rateLimited(platform: string): ExtractorError {
  return new ExtractorError(
    `${platform} is busy right now. Try again in a moment.`,
    true,
    true
  );
}
export function serverError(platform: string): ExtractorError {
  return new ExtractorError(
    `${platform} ran into a server error. Try again shortly.`,
    true,
    true
  );
}
export function temporaryError(
  platform: string,
  noun = 'video'
): ExtractorError {
  return new ExtractorError(
    `Couldn't load this ${platform} ${noun}. Please try again.`,
    true,
    true
  );
}
export function fromStatus(
  status: number,
  platform: string,
  noun = 'video'
): ExtractorError {
  if (status === 404 || status === 410) return notFound(platform, noun);
  if (status === 401 || status === 403) return loginRequired(platform, noun);
  if (status === 429) return rateLimited(platform);
  if (status >= 500) return serverError(platform);
  return noVideo(platform, noun);
}
// Match on code, not message: message text is unstable across runtimes.
const NETWORK_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETDOWN',
  'EPIPE',
  'ESOCKETTIMEDOUT',
  'ETIMEDOUT',
  'EADDRINUSE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function networkCodeOf(error: unknown): string | undefined {
  let node: unknown = error;
  // fetch wraps the socket error, so follow the cause chain
  for (let depth = 0; depth < 4 && node; depth += 1) {
    if (typeof node !== 'object') return undefined;
    const candidate = node as {
      code?: unknown;
      name?: unknown;
      cause?: unknown;
    };
    if (
      typeof candidate.code === 'string' &&
      NETWORK_CODES.has(candidate.code)
    ) {
      return candidate.code;
    }
    if (candidate.name === 'TimeoutError' || candidate.name === 'AbortError') {
      return candidate.name;
    }
    node = candidate.cause;
  }
  return undefined;
}

export function classifyThrown(
  error: unknown,
  platform: string,
  noun = 'video'
): ExtractorError {
  if (error instanceof ExtractorError) return error;

  if (networkCodeOf(error)) return networkError(platform);

  const msg = error instanceof Error ? error.message : String(error);
  if (
    /network|fetch failed|failed to fetch|timeout|timed out|connection|abort|socket|dns/iu.test(
      msg
    )
  ) {
    return networkError(platform);
  }
  return temporaryError(platform, noun);
}
