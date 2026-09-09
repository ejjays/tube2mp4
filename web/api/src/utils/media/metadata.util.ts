import metascraper from 'metascraper';
import { logger } from '../infra/logger.util.js';
import { isSupportedUrl } from '../network/validation.util.js';
import metascraperAuthor from 'metascraper-author';
import metascraperDescription from 'metascraper-description';
import metascraperImage from 'metascraper-image';
import metascraperLogo from 'metascraper-logo';
import metascraperPublisher from 'metascraper-publisher';
import metascraperTitle from 'metascraper-title';
import metascraperUrl from 'metascraper-url';
import metascraperYoutube from 'metascraper-youtube';
import metascraperSpotify from 'metascraper-spotify';
import metascraperInstagram from 'metascraper-instagram';
import metascraperTiktok from 'metascraper-tiktok';
import metascraperSoundcloud from 'metascraper-soundcloud';
import got, { Got, type Options as GotOptions } from 'got';
import { isHost } from '../network/host.util.js';
import { assertPublicTarget, ssrfLookup } from '../network/security.util.js';

const scraper = metascraper([
  metascraperAuthor(),
  metascraperDescription(),
  metascraperImage(),
  metascraperLogo(),
  metascraperPublisher(),
  metascraperTitle(),
  metascraperUrl(),
  metascraperYoutube(),
  metascraperSpotify(),
  metascraperInstagram(),
  metascraperTiktok(),
  metascraperSoundcloud(),
]);

export interface Metadata {
  author: string | null;
  description: string | null;
  image: string | null;
  logo: string | null;
  publisher: string | null;
  title: string | null;
  url: string | null;
  [key: string]: unknown;
}

interface YoutubeOEmbed {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  provider_name?: string;
}

/**
 * Extract a YouTube video id from any common URL form (watch, youtu.be,
 * shorts, live).
 */
function extractYoutubeId(targetUrl: string): string | null {
  const match = targetUrl.match(
    /(?:v=|\/v\/|youtu\.be\/|shorts\/|live\/|embed\/)([0-9A-Za-z_-]{11})/u
  );
  return match ? match[1] : null;
}

/**
 * YouTube oEmbed fast-path.
 *
 * Returns the channel display name (author_name) and title in ~150-300ms,
 * versus 1-3s for a full HTML metascraper fetch. Also avoids the URL-slug
 * "handle" that metascraper-author leaks (e.g. "nijummd-ru1jz").
 */
export async function fetchYoutubeOEmbed(
  targetUrl: string
): Promise<Metadata | null> {
  const videoId = extractYoutubeId(targetUrl);
  if (!videoId) return null;

  const canonical = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`;

  try {
    const response = await (got as unknown as Got)(oembedUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        accept: 'application/json',
      },
      timeout: 2500,
      retry: 0,
      followRedirect: true,
      responseType: 'json',
    });

    const data = response.body as YoutubeOEmbed;
    if (!data || (!data.title && !data.author_name)) return null;

    // use HQ thumbnail
    const hqThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    return {
      author: data.author_name || null,
      description: null,
      image: hqThumbnail,
      logo: null,
      publisher: data.provider_name || 'YouTube',
      title: data.title || null,
      url: canonical,
    };
  } catch (error) {
    logger.debug(
      `[MetadataUtil] oEmbed fast-path failed for ${targetUrl}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// fetch metadata
export async function fetchMetadata(
  targetUrl: string
): Promise<Metadata | null> {
  try {
    if (typeof targetUrl !== 'string' || !targetUrl) return null;
    // rewrite mobile URL
    let fetchUrl = targetUrl;
    if (
      isHost(targetUrl, 'facebook.com') &&
      !isHost(targetUrl, 'm.facebook.com')
    ) {
      fetchUrl = targetUrl.replace('www.facebook.com', 'm.facebook.com');
    }
    if (
      isHost(targetUrl, 'instagram.com') &&
      !isHost(targetUrl, 'm.instagram.com')
    ) {
      fetchUrl = targetUrl.replace('www.instagram.com', 'm.instagram.com');
    }

    if (!isSupportedUrl(fetchUrl)) return null;
    assertPublicTarget(new URL(fetchUrl));

    // set sneaky headers
    const isYouTube =
      isHost(targetUrl, 'youtube.com') || isHost(targetUrl, 'youtu.be');
    const userAgent = isYouTube
      ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';

    const response = await (got as unknown as Got)(fetchUrl, {
      headers: {
        'user-agent': userAgent,
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.5',
        'upgrade-insecure-requests': '1',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        referer: isYouTube ? 'https://www.google.com/' : undefined,
      },
      timeout: 5000,
      retry: 1,
      followRedirect: true,
      lookup: ssrfLookup as unknown as GotOptions['lookup'],
    });

    const html = response.body;
    const url = response.url; // final URL

    const metadata = await scraper({ html, url });
    return metadata as Metadata;
  } catch (error) {
    // debug stealth fail
    logger.debug(
      `[MetadataUtil] Stealth fetch failed for ${targetUrl}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
