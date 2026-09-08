import { ExtractorEnv, defaultEnv } from './shared/env.js';
import { envFetch } from './shared/fetch.js';

export function parseTrackId(url: string): string | null {
  const match = url.match(/track[/:]([A-Za-z0-9]+)/u);
  return match ? match[1] : null;
}

export interface SpotifyEmbed {
  title?: string;
  artist?: string;
  cover?: string;
  durationMs?: number;
  isrc?: string;
  previewUrl?: string;
}

type EmbedEntity = {
  name?: string;
  title?: string;
  artists?: Array<{ name?: string }>;
  subtitle?: string;
  duration?: number;
  duration_ms?: number;
  isrcCode?: string;
  external_ids?: { isrc?: string };
  coverArt?: { sources?: Array<{ url?: string }> };
  visualIdentity?: { image?: Array<{ url?: string }> };
  thumbnailUrl?: string;
  audioPreview?: { url?: string };
  preview_url?: string;
};

const lastOf = <T>(arr?: T[]): T | undefined =>
  arr && arr.length > 0 ? arr[arr.length - 1] : undefined;

function mapEmbedEntity(entity: EmbedEntity | undefined): SpotifyEmbed | null {
  if (!entity) return null;
  const title = entity.name || entity.title;
  if (!title) return null;
  const artist =
    entity.artists?.[0]?.name ||
    (typeof entity.subtitle === 'string' ? entity.subtitle : undefined);
  const cover =
    lastOf(entity.coverArt?.sources)?.url ||
    lastOf(entity.visualIdentity?.image)?.url ||
    entity.thumbnailUrl;
  return {
    title,
    artist,
    cover,
    durationMs: entity.duration ?? entity.duration_ms ?? 0,
    isrc: entity.isrcCode || entity.external_ids?.isrc,
    previewUrl: entity.audioPreview?.url || entity.preview_url,
  };
}

function scriptJson(html: string, id: string): unknown {
  const match = html.match(
    new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)</script>`, 'u')
  );
  if (!match) return null;
  const raw = match[1].trim();
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
}

export function parseEmbedHtml(html: string): SpotifyEmbed | null {
  const next = scriptJson(html, '__NEXT_DATA__') as {
    props?: { pageProps?: { state?: { data?: { entity?: EmbedEntity } } } };
  } | null;
  const fromNext = mapEmbedEntity(next?.props?.pageProps?.state?.data?.entity);
  if (fromNext) return fromNext;
  const resource = scriptJson(html, 'resource') as EmbedEntity | null;
  return mapEmbedEntity(resource ?? undefined);
}

export interface SpotifyMeta {
  id: string;
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  durationMs: number;
  isrc?: string;
  previewUrl?: string;
}

export interface OdesliResult {
  title?: string;
  artist?: string;
  cover?: string;
  isrc?: string;
  youtubeUrl?: string;
}

const firstOf = <T>(...values: (T | undefined | null)[]): T | undefined =>
  values.find((value): value is T => Boolean(value));

export function metaFromEmbed(
  id: string,
  embed: SpotifyEmbed
): SpotifyMeta | null {
  if (!embed.title || !embed.artist) return null;
  return {
    id,
    title: embed.title,
    artist: embed.artist,
    cover: embed.cover,
    durationMs: embed.durationMs || 0,
    isrc: embed.isrc,
    previewUrl: embed.previewUrl,
  };
}

export function metaFromOdesli(
  id: string,
  odesli: OdesliResult
): SpotifyMeta | null {
  if (!odesli.title || !odesli.artist) return null;
  return {
    id,
    title: odesli.title,
    artist: odesli.artist,
    cover: odesli.cover,
    durationMs: 0,
    isrc: odesli.isrc,
  };
}

export function mergeSpotifyMeta(
  id: string,
  embed: SpotifyEmbed | null,
  api: SpotifyMeta | null,
  odesli: OdesliResult | null
): SpotifyMeta | null {
  const title = firstOf(api?.title, embed?.title, odesli?.title);
  const artist = firstOf(api?.artist, embed?.artist, odesli?.artist);
  if (!title || !artist) return null;
  return {
    id,
    title,
    artist,
    album: api?.album,
    cover: firstOf(api?.cover, embed?.cover, odesli?.cover),
    durationMs: firstOf(api?.durationMs, embed?.durationMs) ?? 0,
    isrc: firstOf(api?.isrc, embed?.isrc, odesli?.isrc),
    previewUrl: firstOf(api?.previewUrl, embed?.previewUrl),
  };
}

export function cleanSpotifyTitle(title: string): string {
  let out = '';
  let depth = 0;
  for (const ch of title) {
    if (ch === '(' || ch === '[') depth++;
    if (depth === 0) out += ch;
    if (ch === ')' || ch === ']') depth--;
  }
  out = out.trim();
  while (out.includes('  ')) out = out.replace('  ', ' ');
  return out;
}

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export async function fetchSpotifyEmbed(
  trackId: string,
  env: ExtractorEnv = defaultEnv
): Promise<SpotifyEmbed | null> {
  try {
    const res = await envFetch(
      env,
      `https://open.spotify.com/embed/track/${trackId}`,
      {
        headers: {
          'User-Agent': DESKTOP_UA,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }
    );
    if (res.ok) {
      const parsed = parseEmbedHtml(await res.text());
      if (parsed?.title) return parsed;
    }
  } catch {
    /* fall back to oembed */
  }
  try {
    const target = encodeURIComponent(
      `https://open.spotify.com/track/${trackId}`
    );
    const res = await envFetch(
      env,
      `https://open.spotify.com/oembed?url=${target}`
    );
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        thumbnail_url?: string;
      };
      if (data.title) return { title: data.title, cover: data.thumbnail_url };
    }
  } catch {
    /* callers cover it */
  }
  return null;
}

interface SongLinkEntity {
  title?: string;
  artistName?: string;
  thumbnailUrl?: string;
  isrc?: string;
}

interface SongLinkResponse {
  entityUniqueId?: string;
  entitiesByUniqueId?: Record<string, SongLinkEntity>;
  linksByPlatform?: Record<string, { url?: string }>;
}

export async function fetchOdesli(
  trackId: string,
  env: ExtractorEnv = defaultEnv
): Promise<OdesliResult | null> {
  try {
    const target = encodeURIComponent(
      `https://open.spotify.com/track/${trackId}`
    );
    const res = await envFetch(
      env,
      `https://api.song.link/v1-alpha.1/links?url=${target}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as SongLinkResponse;
    const entities = data.entitiesByUniqueId ?? {};
    const entity = data.entityUniqueId
      ? entities[data.entityUniqueId]
      : undefined;
    const isrc =
      entity?.isrc ?? Object.values(entities).find((item) => item?.isrc)?.isrc;
    const youtubeUrl =
      data.linksByPlatform?.youtube?.url ||
      data.linksByPlatform?.youtubeMusic?.url;
    return {
      title: entity?.title,
      artist: entity?.artistName,
      cover: entity?.thumbnailUrl,
      isrc,
      youtubeUrl,
    };
  } catch {
    return null;
  }
}
