import { Format, VideoInfo, ExtractorOptions } from './shared/types.js';
import { ExtractorEnv, defaultEnv } from './shared/env.js';
import { normalizeTitle, normalizeArtist } from './shared/social.js';
import { DESKTOP_UA, TCO_URL_RE } from './shared/util.js';
import { classifyThrown, noVideo, fromStatus } from './shared/errors.js';
import {
  envFetch,
  backfillSizes,
  selectFormat,
  buildVideoInfo,
} from './shared/fetch.js';

interface XVariant {
  content_type?: string;
  bitrate?: number;
  url?: string;
}
interface XMedia {
  type?: string;
  media_url_https?: string;
  video_info?: { variants?: XVariant[] };
}
interface XTweet {
  text?: string;
  full_text?: string;
  user?: { name?: string; screen_name?: string };
  mediaDetails?: XMedia[];
  quoted_tweet?: XTweet;
}

export function tweetToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/gu, '');
}

function pickMedia(tweet: XTweet): XMedia | undefined {
  return (
    (tweet.mediaDetails ?? []).find(
      (item) => item.type === 'video' || item.type === 'animated_gif'
    ) ??
    (tweet.quoted_tweet?.mediaDetails ?? []).find(
      (item) => item.type === 'video' || item.type === 'animated_gif'
    )
  );
}

function buildFormats(media: XMedia, isAudioMuxed: boolean): Format[] {
  const mapped = (media.video_info?.variants ?? [])
    .filter((variant) => variant.content_type === 'video/mp4' && variant.url)
    .map((variant): Format => {
      const dim = (variant.url ?? '').match(/\/(\d+)x(\d+)\//u);
      const width = dim ? Number(dim[1]) : undefined;
      const height = dim ? Number(dim[2]) : undefined;
      const short = width && height ? Math.min(width, height) : undefined;
      return {
        formatId: short ? `${short}p` : `mp4_${variant.bitrate ?? 0}`,
        url: variant.url as string,
        extension: 'mp4',
        width,
        height,
        resolution: width && height ? `${width}x${height}` : undefined,
        quality: short ? `${short}p` : undefined,
        vcodec: 'h264',
        acodec: 'aac',
        tbr: variant.bitrate ? Math.round(variant.bitrate / 1000) : undefined,
        isMuxed: true,
        isVideo: true,
        // mobile treats these as audio (transcode path); web keeps false so picker lists them as videos
        isAudio: isAudioMuxed,
      };
    });

  mapped.sort((lhs, rhs) => (rhs.tbr ?? 0) - (lhs.tbr ?? 0));
  const seen = new Set<string>();
  const deduped = mapped.filter((format) => {
    const key = format.quality ?? format.formatId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((lhs, rhs) => (rhs.height ?? 0) - (lhs.height ?? 0));
  return deduped;
}

const REFERER = 'https://x.com/';

export function createXExtractor(env: ExtractorEnv = defaultEnv) {
  async function getInfo(
    url: string,
    options: ExtractorOptions = {}
  ): Promise<VideoInfo | null> {
    try {
      const idMatch = url.match(/status\/(\d+)/u);
      if (!idMatch) return null;
      const id = idMatch[1];
      const api = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${tweetToken(id)}&lang=en`;

      const response = await envFetch(env, api, {
        headers: { 'User-Agent': DESKTOP_UA, Accept: 'application/json' },
      });
      if (!response.ok) throw fromStatus(response.status, 'X', 'post');

      const tweet = (await response.json()) as XTweet;
      const media = pickMedia(tweet);
      if (!media) throw noVideo('X');

      const formats = buildFormats(media, options.isAudioMuxed === true);
      if (formats.length === 0) throw noVideo('X');

      // twimg omits filesize — HEAD each variant, fail-soft
      await backfillSizes(
        env,
        formats,
        {
          'User-Agent': DESKTOP_UA,
          Referer: REFERER,
        },
        formats.length
      );

      const caption = (tweet.text || tweet.full_text || 'X Video')
        .replace(TCO_URL_RE, '')
        .trim();

      const info = buildVideoInfo({
        id,
        title: caption || 'X Video',
        uploader: tweet.user?.name || tweet.user?.screen_name || 'X User',
        webpageUrl: url,
        thumbnail: media.media_url_https || undefined,
        formats,
        extractorKey: 'x',
      });

      info.title = normalizeTitle(info as unknown as Record<string, unknown>);
      info.uploader = normalizeArtist(
        info as unknown as Record<string, unknown>
      );
      return info;
    } catch (error: unknown) {
      throw classifyThrown(error, 'X');
    }
  }

  function getStream(
    videoInfo: VideoInfo,
    options: ExtractorOptions = {}
  ): Promise<ReadableStream> {
    const selected = selectFormat(videoInfo, options);
    if (!selected?.url) throw noVideo('X');

    return env.streamUrl(selected.url, {
      'User-Agent': DESKTOP_UA,
      Referer: REFERER,
    });
  }

  return { getInfo, getStream };
}
