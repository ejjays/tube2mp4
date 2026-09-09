// detects whether the device decodes av1
let cachedAV1Support: boolean | null = null;
let initPromise: Promise<boolean> | null = null;

const AV1_PROBE_STRINGS = [
  'video/mp4; codecs="av01.0.05M.08"',
  'video/mp4; codecs="av01.0.08M.08"',
];

interface MediaConfig {
  type: 'file';
  video: {
    contentType: string;
    width: number;
    height: number;
    bitrate: number;
    framerate: number;
  };
}

interface DecodingInfo {
  supported: boolean;
  smooth: boolean;
  powerEfficient: boolean;
}

interface MediaCapabilitiesAPI {
  decodingInfo: (config: MediaConfig) => Promise<DecodingInfo>;
}

function probeMediaCapabilities(): Promise<boolean> {
  const nav = globalThis.navigator as Navigator & {
    mediaCapabilities?: MediaCapabilitiesAPI;
  };
  if (!nav?.mediaCapabilities?.decodingInfo) {
    return Promise.resolve(false);
  }
  // common 1080p 30fps av1 profile, mid bitrate
  return nav.mediaCapabilities
    .decodingInfo({
      type: 'file',
      video: {
        contentType: 'video/mp4; codecs="av01.0.08M.08"',
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        framerate: 30,
      },
    })
    .then((info) =>
      Boolean(info.supported && info.smooth && info.powerEfficient)
    )
    .catch(() => false);
}

function probeMediaSource(): boolean {
  try {
    const ms = globalThis.MediaSource;
    if (ms && typeof ms.isTypeSupported === 'function') {
      return AV1_PROBE_STRINGS.some((type) => ms.isTypeSupported(type));
    }
    if (typeof document !== 'undefined') {
      const probe = document.createElement('video');
      return AV1_PROBE_STRINGS.some(
        (type) => probe.canPlayType(type) === 'probably'
      );
    }
  } catch {
    return false;
  }
  return false;
}

// init populates cache before filter runs
export function initAV1Support(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = probeMediaCapabilities().then((smooth) => {
    cachedAV1Support = smooth;
    if (typeof console !== 'undefined') {
      console.info(
        `[codec-support] AV1 smooth decode: ${smooth ? 'YES' : 'NO'} (mediaCapabilities)`
      );
    }
    return smooth;
  });
  return initPromise;
}

export function supportsAV1(): boolean {
  if (cachedAV1Support !== null) return cachedAV1Support;
  // sync fallback before init resolves; kept conservative
  cachedAV1Support = probeMediaSource();
  if (typeof console !== 'undefined') {
    console.info(
      `[codec-support] AV1 sync fallback: ${cachedAV1Support ? 'YES' : 'NO'} (isTypeSupported)`
    );
  }
  return cachedAV1Support;
}

const AV1_FORMAT_IDS = new Set([
  '394',
  '395',
  '396',
  '397',
  '398',
  '399',
  '400',
  '401',
  '571',
]);

interface FormatLike {
  formatId?: string;
  vcodec?: string;
}

export function isAV1Format(format: FormatLike | null | undefined): boolean {
  if (!format) return false;
  const vcodec = String(format.vcodec || '');
  if (vcodec.startsWith('av01')) return true;
  return AV1_FORMAT_IDS.has(String(format.formatId || ''));
}

export function filterUnsupportedCodecs<
  T extends { formatId?: string; vcodec?: string },
>(formats: T[]): T[] {
  if (supportsAV1()) return formats;
  const filtered = formats.filter((format) => !isAV1Format(format));
  if (typeof console !== 'undefined' && filtered.length !== formats.length) {
    console.info(
      `[codec-support] filtered ${formats.length - filtered.length} av1 formats`
    );
  }
  return filtered;
}
