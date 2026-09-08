import { ExtractorEnv } from './env.js';
import { Format, VideoInfo } from './types.js';

export const DEFAULT_TIMEOUT_MS = 10_000;

/** undefined on runtimes without AbortSignal.timeout (old Hermes) — degrades to no timeout. */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}

/** merge a timeout signal into init without clobbering a caller-provided one */
export function withTimeout(
  env: ExtractorEnv,
  init?: RequestInit
): RequestInit | undefined {
  const ms = env.timeoutMs ?? 0;
  if (!ms || init?.signal) return init;
  const signal = timeoutSignal(ms);
  if (!signal) return init;
  return { ...init, signal };
}

/** All package requests route through here so env.timeoutMs is one knob. */
export function envFetch(
  env: ExtractorEnv,
  url: string,
  init?: RequestInit
): Promise<Response> {
  return env.fetch(url, withTimeout(env, init));
}

/** Fail-soft: a missing size degrades the picker, it must never fail extraction. */
export async function probeFileSize(
  env: ExtractorEnv,
  url: string,
  headers: Record<string, string> = {}
): Promise<number | undefined> {
  try {
    const res = await envFetch(env, url, { method: 'HEAD', headers });
    if (!res.ok) return undefined;
    const len = res.headers.get('content-length');
    return len ? parseInt(len, 10) : undefined;
  } catch {
    return undefined;
  }
}

export async function backfillSizes(
  env: ExtractorEnv,
  formats: Format[],
  headers: Record<string, string> = {},
  concurrency = 3
): Promise<void> {
  for (let i = 0; i < formats.length; i += concurrency) {
    const batch = formats.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (format) => {
        if (!format.url || format.filesize) return;
        const size = await probeFileSize(env, format.url, headers);
        if (size) format.filesize = size;
      })
    );
  }
}

/** Only place a VideoInfo is constructed; owns the isPartial => !isFullData invariant. */
export type VideoInfoInput = Partial<VideoInfo> &
  Pick<VideoInfo, 'id' | 'title' | 'uploader' | 'webpageUrl' | 'extractorKey'>;

export function buildVideoInfo(input: VideoInfoInput): VideoInfo {
  const isPartial = input.isPartial ?? false;
  return {
    type: 'video',
    formats: [],
    thumbnail: undefined,
    duration: undefined,
    isJsInfo: true,
    fromBrain: false,
    isIsrcMatch: false,
    ...input,
    isPartial,
    isFullData: isPartial ? false : (input.isFullData ?? true),
  };
}

export function selectFormat(
  videoInfo: VideoInfo,
  options: { formatId?: string } = {},
  pool?: Format[]
): Format | undefined {
  const formats = pool ?? videoInfo.formats;
  return (
    formats.find(
      (format) => String(format.formatId) === String(options.formatId)
    ) ?? formats[0]
  );
}
