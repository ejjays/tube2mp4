import { Format, VideoInfo, ExtractorOptions } from './shared/types.js';
import { ExtractorEnv, defaultEnv } from './shared/env.js';
import { DESKTOP_UA } from './shared/util.js';
import {
  notFound,
  noVideo,
  fromStatus,
  classifyThrown,
  ExtractorError,
} from './shared/errors.js';
import { hostOf } from './shared/host.js';
import {
  envFetch,
  probeFileSize,
  selectFormat,
  buildVideoInfo,
} from './shared/fetch.js';

const REFERER = 'https://www.snapchat.com/';
const PUBLIC_PAGE = 'https://www.snapchat.com/spotlight/';

interface VideoMetadata {
  name?: string;
  description?: string;
  thumbnailUrl?: string;
  contentUrl?: string;
  width?: number;
  height?: number;
  durationMs?: string | number;
  embeddedTextCaption?: string;
  creator?: {
    $case?: string;
    personCreator?: { username?: string; name?: string; url?: string };
  };
}

interface StoryMeta {
  videoMetadata?: VideoMetadata;
  llmTitle?: string;
  llmDescription?: string;
}
interface StoryEntry {
  story?: { storyId?: { value?: string } };
  metadata?: StoryMeta;
}
interface NextData {
  props?: {
    pageProps?: { spotlightFeed?: { spotlightStories?: StoryEntry[] } };
  };
}

function isSnapchatHost(url: string): boolean {
  const host = hostOf(url);
  return (
    host === 'snapchat.com' ||
    host === 'www.snapchat.com' ||
    host === 't.snapchat.com' ||
    host === 'story.snapchat.com'
  );
}
export function parseSpotlightId(url: string): string | null {
  const m = url.match(/\/spotlight\/([A-Za-z0-9_-]+)/u);
  return m ? m[1] : null;
}
function nextDataFromHtml(html: string): NextData | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/u);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as NextData;
  } catch {
    return null;
  }
}
function findStory(data: NextData, id: string): StoryMeta | null {
  const stories = data.props?.pageProps?.spotlightFeed?.spotlightStories;
  if (!Array.isArray(stories)) return null;
  for (const entry of stories) {
    if (entry?.story?.storyId?.value !== id) continue;
    if (entry.metadata?.videoMetadata?.contentUrl) return entry.metadata;
  }
  return null;
}
async function resolveCanonical(
  env: ExtractorEnv,
  url: string
): Promise<string> {
  try {
    const head = await envFetch(env, url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': DESKTOP_UA },
    } as RequestInit);
    if (head.ok || (head as unknown as { status: number }).status < 400)
      return (head as unknown as { url: string }).url ?? url;
  } catch {
    /* HEAD refused */
  }
  const res = await envFetch(env, url, {
    redirect: 'follow',
    headers: { 'User-Agent': DESKTOP_UA },
  } as RequestInit);
  return (res as unknown as { url: string }).url ?? url;
}
function buildFormat(meta: VideoMetadata): Format {
  const w = meta.width && meta.width > 0 ? meta.width : undefined;
  const h = meta.height && meta.height > 0 ? meta.height : undefined;
  const short = h ?? w ?? 0;
  return {
    formatId: short ? `${short}p` : 'source',
    url: meta.contentUrl as string,
    extension: 'mp4',
    resolution: w && h ? `${w}x${h}` : undefined,
    quality: short ? `${short}p` : 'Source',
    width: w,
    height: h,
    vcodec: 'h264',
    acodec: 'aac',
    isVideo: true,
    isAudio: true,
    isMuxed: true,
  };
}

interface Creator {
  username?: string;
  displayName?: string;
  url?: string;
}
function creatorFrom(meta: VideoMetadata): Creator {
  const pc = meta.creator?.personCreator;
  if (!pc) return {};
  return { username: pc.username, displayName: pc.name, url: pc.url };
}
function handleFromOgUrl(html: string): string | undefined {
  const tag = html.match(/<meta[^>]+property=["']og:url["'][^>]*>/iu);
  const content = tag?.[0].match(/content=["']([^"']+)["']/iu)?.[1];
  return content?.match(/\/@([A-Za-z0-9._-]+)\/spotlight\//iu)?.[1];
}
const GENERIC_NAMES = new Set([
  'spotlight snap',
  'spotlight',
  'another spotlight snap brought to you by snapchat',
]);
function trimTitle(text: string): string {
  if (text.length <= 100) return text;
  const cut = text.slice(0, 100);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60))}…`;
}
function cleanRaw(raw: string | undefined): string {
  return (raw || '').replace(/\s+/gu, ' ').trim();
}
function isGeneric(text: string): boolean {
  return GENERIC_NAMES.has(text.toLowerCase());
}
function hasNonHashtagWord(text: string): boolean {
  const stripped = text.replace(/#[\p{L}\p{N}_]+/gu, '').trim();
  return /\S/u.test(stripped);
}
function pickTitle(
  video: VideoMetadata | undefined,
  story: StoryMeta | undefined,
  creator: Creator
): string {
  const llm = cleanRaw(story?.llmTitle);
  if (llm) return trimTitle(llm);
  const name = cleanRaw(video?.name);
  if (name && !isGeneric(name)) return trimTitle(name);
  const caption = cleanRaw(video?.embeddedTextCaption);
  if (caption && !isGeneric(caption) && hasNonHashtagWord(caption))
    return trimTitle(caption);
  const description = cleanRaw(video?.description);
  if (description && !isGeneric(description) && hasNonHashtagWord(description))
    return trimTitle(description);
  return creator.displayName || creator.username || 'Snapchat Spotlight';
}
function pickUploader(creator: Creator): string {
  return creator.displayName || creator.username || 'Snapchat';
}

export function createSnapchatExtractor(env: ExtractorEnv = defaultEnv) {
  async function getInfo(
    url: string,
    _opts: ExtractorOptions = {}
  ): Promise<VideoInfo | null> {
    if (!isSnapchatHost(url)) return null;
    const isShort = /^https?:\/\/t\.snapchat\.com\//iu.test(url);
    const isProfile = /\/@[A-Za-z0-9._-]+\/spotlight\//u.test(url);
    let target = url;
    if (isShort || isProfile) target = await resolveCanonical(env, url);
    if (!/\/spotlight\//iu.test(target)) {
      if (isShort) throw notFound('Snapchat', 'spotlight');
      return null;
    }
    const id = parseSpotlightId(target);
    if (!id) {
      if (isShort) throw notFound('Snapchat', 'spotlight');
      return null;
    }
    try {
      const pageUrl = `${PUBLIC_PAGE}${id}`;
      const res = await envFetch(env, pageUrl, {
        headers: { 'User-Agent': DESKTOP_UA, Referer: REFERER },
      });
      if (!res.ok) throw fromStatus(res.status, 'Snapchat', 'spotlight');
      const html = await res.text();
      const data = nextDataFromHtml(html);
      if (!data) throw noVideo('Snapchat', 'spotlight');
      const story = findStory(data, id);
      const meta = story?.videoMetadata;
      if (!meta?.contentUrl) throw noVideo('Snapchat', 'spotlight');
      const durationMs =
        typeof meta.durationMs === 'string'
          ? parseInt(meta.durationMs, 10)
          : meta.durationMs;
      const duration =
        durationMs && durationMs > 0
          ? Math.round(durationMs / 1000)
          : undefined;
      const format = buildFormat(meta);
      const creator = creatorFrom(meta);
      if (!creator.username && !creator.displayName)
        creator.username = handleFromOgUrl(html);
      format.filesize = await probeFileSize(env, meta.contentUrl, {
        'User-Agent': DESKTOP_UA,
        Referer: REFERER,
      });
      return buildVideoInfo({
        id,
        title: pickTitle(meta, story ?? undefined, creator),
        uploader: pickUploader(creator),
        webpageUrl: pageUrl,
        thumbnail: meta.thumbnailUrl,
        duration,
        formats: [format],
        extractorKey: 'snapchat',
        downloadHeaders: { 'User-Agent': DESKTOP_UA, Referer: REFERER },
      });
    } catch (error: unknown) {
      if (error instanceof ExtractorError) throw error;
      throw classifyThrown(error, 'Snapchat', 'spotlight');
    }
  }

  function getStream(
    videoInfo: VideoInfo,
    options: ExtractorOptions = {}
  ): Promise<ReadableStream> {
    const sel = selectFormat(videoInfo, options);
    if (!sel?.url) throw noVideo('Snapchat', 'spotlight');
    return env.streamUrl(sel.url, {});
  }

  return { getInfo, getStream };
}
