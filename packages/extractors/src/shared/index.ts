// Public surface of the shared internals. Exposed as the `@phantom/extractors/shared`
// subpath so consumers can reuse the same primitives (env helpers, HLS parsing,
// error factories, host matching) their own platform-specific extractors use —
// instead of re-implementing and drifting.
export { ExtractorEnv, defaultEnv } from './env.js';

export type {
  Format,
  VideoInfo,
  Extractor,
  ExtractorOptions,
  PlaylistEntry,
} from './types.js';
export { ExtractorError } from './types.js';

export {
  notFound,
  privateVideo,
  loginRequired,
  geoBlocked,
  ageRestricted,
  restricted,
  noVideo,
  networkError,
  rateLimited,
  serverError,
  temporaryError,
  fromStatus,
  classifyThrown,
} from './errors.js';

export {
  DEFAULT_TIMEOUT_MS,
  timeoutSignal,
  withTimeout,
  envFetch,
  probeFileSize,
  backfillSizes,
  buildVideoInfo,
  selectFormat,
} from './fetch.js';
export type { VideoInfoInput } from './fetch.js';

export {
  parseHlsMaster,
  hlsVariantsToFormats,
  mediaPlaylistDuration,
} from './hls.js';
export type { HlsVariant, HlsMaster } from './hls.js';

export { hostOf, matchesDomain } from './host.js';

export { buildPageHeaders } from './headers.js';

export {
  DESKTOP_UA,
  VIMEO_REFERER,
  TCO_URL_RE,
  hlsDurationSec,
  estimateSize,
  normalizeUrl,
  decodeEntities,
} from './util.js';

export { normalizeTitle, normalizeArtist } from './social.js';
export type { RawSocialData } from './social.js';

export { getExtractor, getRouteName, resolve } from './resolve.js';
