import type { Format, VideoInfo } from '../../src/types/index.js';
import type { FinalResponse } from '@phantom/shared/schemas/media.schema';

export type Tier = 'solid' | 'soft';

export interface E2EExpect {
  minFormats?: number;
  mediaKind?: 'video' | 'audio';
  wantThumb?: boolean;
  wantResolution?: boolean;
  wantFilesize?: boolean;
  rejectUploader?: string;
  expectAuthor?: string;
  allowPlatformUploader?: boolean;
  mustHaveIsrc?: boolean;
}

export interface E2ECase {
  id: string;
  tier: Tier;
  url: string;
  expect: E2EExpect;
}

type AnyInfo = (VideoInfo & { cover?: string; imageUrl?: string }) | FinalResponse | null;

function lower(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function pickUploader(info: AnyInfo): string {
  if (!info) return '';
  const anyInfo = info as Record<string, unknown>;
  return (
    (anyInfo.uploader as string) ||
    (anyInfo.artist as string) ||
    (anyInfo.author as string) ||
    ''
  );
}

export function pickTitle(info: AnyInfo): string {
  if (!info) return '';
  return (info as Record<string, unknown>).title as string || '';
}

export function pickThumb(info: AnyInfo): string {
  if (!info) return '';
  const anyInfo = info as Record<string, unknown>;
  return (
    (anyInfo.thumbnail as string) ||
    (anyInfo.cover as string) ||
    (anyInfo.imageUrl as string) ||
    ''
  );
}

export function allFormats(info: AnyInfo): Format[] {
  if (!info) return [];
  const anyInfo = info as Record<string, unknown>;
  const fmts = (anyInfo.formats as Format[] | undefined) ?? [];
  const audio = (anyInfo.audioFormats as Format[] | undefined) ?? [];
  return [...fmts, ...audio];
}

export function hasThumb(info: AnyInfo): boolean {
  const thumb = pickThumb(info);
  return Boolean(thumb && thumb !== '/logo.webp' && thumb.length > 8);
}

export function hasResolution(info: AnyInfo): boolean {
  return allFormats(info).some(
    (format) =>
      Boolean(format.height && format.height > 0) ||
      Boolean(format.resolution && format.resolution.length > 0) ||
      Boolean(format.width && format.width > 0)
  );
}

export function hasFilesize(info: AnyInfo): boolean {
  return allFormats(info).some(
    (format) => typeof format.filesize === 'number' && format.filesize > 0
  );
}

export function isAudioOnly(info: AnyInfo): boolean {
  const fmts = allFormats(info);
  if (fmts.length === 0) return false;
  return fmts.every((format) => format.isAudio || format.vcodec === 'none');
}

export function isVideoPresent(info: AnyInfo): boolean {
  return allFormats(info).some(
    (format) => format.isVideo || (format.vcodec && format.vcodec !== 'none')
  );
}

export function isTransientBotError(message: string): boolean {
  const lowerMsg = message.toLowerCase();
  return (
    lowerMsg.includes('sign in to confirm you') ||
    lowerMsg.includes('bot detection') ||
    lowerMsg.includes('requested format is not available') ||
    lowerMsg.includes('captcha') ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('429') ||
    lowerMsg.includes('private') ||
    lowerMsg.includes('login required')
  );
}

export interface AssertResult {
  passed: boolean;
  failures: string[];
  thumb: string;
  uploader: string;
  title: string;
  formats: number;
  hasThumb: boolean;
  anyResolution: boolean;
  anyFilesize: boolean;
  audioOnly: boolean;
}

export function assertE2EMeta(
  info: AnyInfo,
  expect: E2EExpect,
  caseId: string
): AssertResult {
  const failures: string[] = [];
  const title = pickTitle(info);
  const uploader = pickUploader(info);
  const thumb = pickThumb(info);
  const fmts = allFormats(info);
  const formats = fmts.length;

  const pass = (cond: boolean, msg: string) => {
    if (!cond) failures.push(msg);
  };

  pass(Boolean(title), 'title present');
  pass(Boolean(uploader), 'uploader present');

  if (expect.rejectUploader && lower(uploader) === lower(expect.rejectUploader)) {
    failures.push(`uploader is junk placeholder '${expect.rejectUploader}'`);
  }

  if (
    expect.allowPlatformUploader !== true &&
    caseId.length >= 5 &&
    uploader &&
    lower(uploader).includes(lower(caseId))
  ) {
    failures.push(`uploader looks like platform fallback ('${uploader}' ~ '${caseId}')`);
  }

  if (expect.expectAuthor) {
    if (lower(uploader) !== lower(expect.expectAuthor)) {
      failures.push(`author '${uploader}' != expected '${expect.expectAuthor}'`);
    }
  }

  const minFormats = expect.minFormats ?? 1;
  pass(formats >= minFormats, `formats ${formats} >= ${minFormats}`);

  if (expect.wantThumb) {
    pass(hasThumb(info), 'thumbnail url present');
  }

  if (expect.wantResolution) {
    pass(hasResolution(info), 'resolution present');
  }

  if (expect.wantFilesize) {
    pass(hasFilesize(info), 'filesize present');
  }

  if (expect.mustHaveIsrc) {
    const anyInfo = info as Record<string, unknown>;
    const isrc = anyInfo.isrc as string | undefined;
    pass(Boolean(isrc), 'isrc present');
  }

  if (expect.mediaKind === 'audio') {
    pass(isAudioOnly(info) || fmts.some((format) => format.isAudio), 'audio-only formats');
  } else if (expect.mediaKind === 'video') {
    pass(isVideoPresent(info), 'has video format');
  }

  return {
    passed: failures.length === 0,
    failures,
    thumb,
    uploader,
    title,
    formats,
    hasThumb: hasThumb(info),
    anyResolution: hasResolution(info),
    anyFilesize: hasFilesize(info),
    audioOnly: isAudioOnly(info),
  };
}

export function selectCases(
  allCases: E2ECase[],
  opts: { tierMode: string; shardIndex: number; shardTotal: number; singleUrl?: string }
): E2ECase[] {
  let filtered: E2ECase[];
  if (opts.singleUrl) {
    filtered = [
      {
        id: 'custom',
        tier: 'solid',
        url: opts.singleUrl,
        expect: { minFormats: 1 },
      },
    ];
  } else if (opts.tierMode === 'all') {
    filtered = allCases;
  } else {
    filtered = allCases.filter((entry) => entry.tier === opts.tierMode);
  }

  if (opts.shardTotal > 1) {
    return filtered.filter(
      (_entry, index) => index % opts.shardTotal === opts.shardIndex % opts.shardTotal
    );
  }
  return filtered;
}

export function shouldSkipForEnv(caseId: string): string | null {
  if (caseId === 'tiktok' && !process.env.LIVE_PROXY && process.env.TIKTOK_LIVE !== '1') {
    return 'needs LIVE_PROXY or TIKTOK_LIVE=1 (datacenter captcha)';
  }
  return null;
}
