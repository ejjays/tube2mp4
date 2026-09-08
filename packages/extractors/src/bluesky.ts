import { Format, VideoInfo, ExtractorOptions } from './shared/types.js';
import { ExtractorEnv, defaultEnv } from './shared/env.js';
import { normalizeTitle, normalizeArtist } from './shared/social.js';
import { noVideo, classifyThrown } from './shared/errors.js';
import { DESKTOP_UA } from './shared/util.js';
import { envFetch, selectFormat, buildVideoInfo } from './shared/fetch.js';
import {
  parseHlsMaster,
  hlsVariantsToFormats,
  mediaPlaylistDuration,
} from './shared/hls.js';

const APPVIEW = 'https://public.api.bsky.app/xrpc';

interface AspectRatio {
  width?: number;
  height?: number;
}
interface VideoView {
  playlist?: string;
  thumbnail?: string;
  aspectRatio?: AspectRatio;
}
interface BskyEmbedView {
  $type?: string;
  playlist?: string;
  thumbnail?: string;
  media?: VideoView;
}
interface QuotedRef {
  uri?: string;
  record?: { uri?: string };
}
interface BskyPost {
  record?: { text?: string; embed?: { record?: QuotedRef } };
  embed?: BskyEmbedView;
  author?: { displayName?: string; handle?: string };
}

interface Variant {
  url: string;
  width: number;
  height: number;
  bandwidth: number;
}

function videoView(post: BskyPost | undefined): VideoView | null {
  const view = post?.embed;
  if (view?.playlist) return view;
  if (view?.media?.playlist) return view.media;
  return null;
}

// quote-posts: video lives in the quoted post
function quotedUri(post: BskyPost | undefined): string | undefined {
  const rec = post?.record?.embed?.record;
  return rec?.uri ?? rec?.record?.uri;
}

function buildFormats(variants: Variant[], durationSec: number): Format[] {
  const formats = hlsVariantsToFormats(
    { variants: variants.map((v) => ({ ...v, codecs: '' })) },
    { durationSec, keepAlive: false }
  );
  for (const format of formats) {
    format.vcodec = 'h264';
    format.acodec = 'aac';
    format.note = 'hls m3u8';
  }
  return formats;
}

export function createBlueskyExtractor(env: ExtractorEnv = defaultEnv) {
  async function fetchJson<T>(url: string): Promise<T | null> {
    const res = await envFetch(env, url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  }

  // any variant gives runtime; web skips via env.skipDurationFetch
  async function fetchDuration(variants: Variant[]): Promise<number> {
    const smallest = [...variants].sort(
      (lhs, rhs) => lhs.bandwidth - rhs.bandwidth
    )[0];
    if (!smallest) return 0;
    try {
      const res = await envFetch(env, smallest.url, {
        headers: { 'User-Agent': DESKTOP_UA },
      });
      if (!res.ok) return 0;
      return mediaPlaylistDuration(await res.text());
    } catch {
      return 0;
    }
  }

  async function resolveView(
    post: BskyPost | undefined
  ): Promise<{ view: VideoView; post: BskyPost } | null> {
    const direct = videoView(post);
    if (direct && post) return { view: direct, post };

    const quoted = quotedUri(post);
    const match = quoted?.match(
      /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/u
    );
    if (!match) return null;
    const [, qDid, qRkey] = match;
    const qThread = await fetchJson<{ thread?: { post?: BskyPost } }>(
      `${APPVIEW}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(
        `at://${qDid}/app.bsky.feed.post/${qRkey}`
      )}`
    );
    const qPost = qThread?.thread?.post;
    const view = videoView(qPost);
    return view && qPost ? { view, post: qPost } : null;
  }

  async function getInfo(
    url: string,
    _options: ExtractorOptions = {}
  ): Promise<VideoInfo | null> {
    try {
      const match = url.match(/profile\/([^/]+)\/post\/([^/?#]+)/u);
      if (!match) return null;
      const [, handle, rkey] = match;

      const resolved = await fetchJson<{ did?: string }>(
        `${APPVIEW}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
      );
      const did = resolved?.did;
      if (!did) throw noVideo('Bluesky');

      const thread = await fetchJson<{ thread?: { post?: BskyPost } }>(
        `${APPVIEW}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(
          `at://${did}/app.bsky.feed.post/${rkey}`
        )}`
      );
      const post = thread?.thread?.post;

      const found = await resolveView(post);
      if (!found?.view.playlist) throw noVideo('Bluesky');

      const master = await envFetch(env, found.view.playlist, {
        headers: { 'User-Agent': DESKTOP_UA },
      });
      if (!master.ok) throw noVideo('Bluesky');
      const parsed = parseHlsMaster(await master.text(), found.view.playlist);
      if (parsed.variants.length === 0) throw noVideo('Bluesky');

      // web skips the extra round-trip via env.skipDurationFetch
      const duration = env.skipDurationFetch
        ? 0
        : await fetchDuration(parsed.variants);
      const formats = buildFormats(parsed.variants, duration);
      if (formats.length === 0) throw noVideo('Bluesky');

      const info = buildVideoInfo({
        id: rkey,
        title: post?.record?.text || 'Bluesky Video',
        uploader:
          post?.author?.displayName || post?.author?.handle || 'Bluesky User',
        webpageUrl: url,
        thumbnail: found.view.thumbnail,
        duration: duration || undefined,
        formats,
        extractorKey: 'bluesky',
        downloadHeaders: { 'User-Agent': DESKTOP_UA },
      });
      info.title = normalizeTitle(info as unknown as Record<string, unknown>);
      info.uploader = normalizeArtist(
        info as unknown as Record<string, unknown>
      );
      return info;
    } catch (error: unknown) {
      throw classifyThrown(error, 'Bluesky');
    }
  }

  // bluesky is always HLS — needs env.remuxHls
  function getStream(
    videoInfo: VideoInfo,
    options: ExtractorOptions = {}
  ): Promise<ReadableStream> {
    const selected = selectFormat(videoInfo, options);
    if (!selected?.url) throw noVideo('Bluesky');

    if (!env.remuxHls) {
      throw new Error(
        'bluesky streams are HLS (.m3u8) and need remuxing to mp4 — ' +
          'pass env.remuxHls(url, headers) (e.g. spawn ffmpeg) to enable getStream()'
      );
    }
    return env.remuxHls(selected.url, {
      'User-Agent': DESKTOP_UA,
    });
  }

  return { getInfo, getStream };
}
