import { SHORTCODE_ALPHABET } from './constants.js';
import { IgMedia, IgParsed, IgDashVideo } from './types.js';

export function extractShortcode(url: string): string | null {
  const match = url.match(/\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/u);
  return match ? match[1] : null;
}

export function shortcodeToMediaId(shortcode: string): string {
  const code = shortcode.length > 28 ? shortcode.slice(0, -28) : shortcode;
  if (!code) return '';
  let pk = 0n;
  for (const char of code) {
    const index = SHORTCODE_ALPHABET.indexOf(char);
    if (index < 0) return '';
    pk = pk * 64n + BigInt(index);
  }
  return pk.toString();
}

export function objFrom(
  name: string,
  html: string
): Record<string, unknown> | null {
  const match = html.match(
    new RegExp(`\\["${name}",.*?,(\\{.*?\\}),\\d+\\]`, 'u')
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseDashManifest(manifest: string): {
  videos: IgDashVideo[];
  audioUrl?: string;
} {
  const videos: IgDashVideo[] = [];
  let audioUrl: string | undefined;
  let bestAudioBw = -1;
  for (const rep of manifest.matchAll(
    /<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gu
  )) {
    const attrs = rep[1];
    const baseMatch = rep[2].match(/<BaseURL>([^<]+)<\/BaseURL>/u);
    if (!baseMatch) continue;
    const url = baseMatch[1].trim().replace(/&amp;/gu, '&');
    const width = Number(attrs.match(/\bwidth="(\d+)"/u)?.[1] ?? 0);
    const height = Number(attrs.match(/\bheight="(\d+)"/u)?.[1] ?? 0);
    const isAudio = /mimeType="audio/u.test(attrs) || (!width && !height);
    if (isAudio) {
      const bandwidth = Number(attrs.match(/\bbandwidth="(\d+)"/u)?.[1] ?? 0);
      if (bandwidth > bestAudioBw) {
        bestAudioBw = bandwidth;
        audioUrl = url;
      }
    } else if (width && height) {
      videos.push({ url, width, height });
    }
  }
  const seen = new Set<string>();
  return {
    videos: videos.filter((video) => {
      const key = `${video.width}x${video.height}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    audioUrl,
  };
}

export function expandDashVariants(
  base: IgMedia,
  manifest?: string
): IgMedia[] {
  if (!base.isVideo) return [base];
  const dash = manifest ? parseDashManifest(manifest) : null;
  if (!dash || dash.videos.length === 0 || !dash.audioUrl) return [base];
  const list: IgMedia[] = dash.videos.map((video) => {
    const short = Math.min(video.width, video.height);
    return {
      url: video.url,
      isVideo: true,
      width: video.width,
      height: video.height,
      muxAudioUrl: dash.audioUrl,
      muxAudioExt: 'm4a',
      isMuxed: false,
      formatId: `${short}p`,
      quality: `${short}p`,
    };
  });
  const pShort =
    base.width && base.height ? Math.min(base.width, base.height) : 0;
  list.push({
    ...base,
    isMuxed: true,
    formatId: pShort ? `${pShort}p_progressive` : 'sd',
    quality: pShort ? `${pShort}p` : 'SD',
  });
  list.sort(
    (lhs, rhs) =>
      (rhs.width ?? 0) * (rhs.height ?? 0) -
      (lhs.width ?? 0) * (lhs.height ?? 0)
  );
  const seen = new Set<string>();
  return list.filter((entry) => {
    const key = entry.formatId as string;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface GqlNode {
  shortcode?: string;
  id?: string;
  video_url?: string;
  display_url?: string;
  dimensions?: { width?: number; height?: number };
  dash_info?: { video_dash_manifest?: string };
  edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> };
  owner?: { full_name?: string; username?: string };
  edge_sidecar_to_children?: { edges?: Array<{ node?: GqlNode }> };
}

interface IgProduct {
  code?: string;
  pk?: string;
  id?: string;
  caption?: { text?: string };
  user?: { full_name?: string; username?: string };
  image_versions2?: { candidates?: Array<{ url?: string; width?: number; height?: number }> };
  video_versions?: Array<{ url?: string; width?: number; height?: number }>;
  carousel_media?: IgProduct[];
  video_dash_manifest?: string;
}

function mediaFromGql(node: GqlNode | undefined): IgMedia | null {
  if (!node) return null;
  if (node.video_url) {
    return {
      url: node.video_url,
      isVideo: true,
      width: node.dimensions?.width,
      height: node.dimensions?.height,
    };
  }
  if (node.display_url) {
    return {
      url: node.display_url,
      isVideo: false,
      width: node.dimensions?.width,
      height: node.dimensions?.height,
    };
  }
  return null;
}

function mediaFromVersions(node: IgProduct): IgMedia | null {
  const videos = node.video_versions;
  if (Array.isArray(videos) && videos.length > 0) {
    const best = videos.reduce((prev, next) =>
      (prev.width ?? 0) * (prev.height ?? 0) <
      (next.width ?? 0) * (next.height ?? 0)
        ? next
        : prev
    );
    if (best.url) {
      return {
        url: best.url,
        isVideo: true,
        width: best.width,
        height: best.height,
      };
    }
  }
  const candidate = node.image_versions2?.candidates?.[0];
  if (candidate?.url) {
    return {
      url: candidate.url,
      isVideo: false,
      width: candidate.width,
      height: candidate.height,
    };
  }
  return null;
}

function singleVideoMedia(node: GqlNode): IgMedia[] {
  const base = mediaFromGql(node);
  if (!base) return [];
  return expandDashVariants(base, node.dash_info?.video_dash_manifest);
}

export function parseGraphqlMedia(node: GqlNode | null): IgParsed | null {
  if (!node) return null;
  const sidecar = node.edge_sidecar_to_children?.edges;
  const media: IgMedia[] = Array.isArray(sidecar)
    ? (sidecar
        .map((edge) => mediaFromGql(edge?.node))
        .filter(Boolean) as IgMedia[])
    : singleVideoMedia(node);
  if (media.length === 0) return null;
  return {
    id: node.shortcode || node.id || null,
    title:
      node.edge_media_to_caption?.edges?.[0]?.node?.text || 'Instagram Post',
    uploader: node.owner?.full_name || node.owner?.username || 'Instagram User',
    thumbnail: node.display_url,
    media,
  };
}

export function parseLoggedOutProduct(
  product: IgProduct | null
): IgParsed | null {
  if (!product) return null;
  const carousel = product.carousel_media;
  let media: IgMedia[];
  if (Array.isArray(carousel)) {
    media = carousel.map(mediaFromVersions).filter(Boolean) as IgMedia[];
  } else {
    const base = mediaFromVersions(product);
    media = base ? expandDashVariants(base, product.video_dash_manifest) : [];
  }
  if (media.length === 0) return null;
  return {
    id: product.code || product.pk || product.id || null,
    title: product.caption?.text || 'Instagram Post',
    uploader:
      product.user?.full_name || product.user?.username || 'Instagram User',
    thumbnail: product.image_versions2?.candidates?.[0]?.url,
    media,
  };
}

export function parseMobileItem(item: IgProduct | null): IgParsed | null {
  return parseLoggedOutProduct(item);
}

function ogMeta(html: string, prop: string): string | undefined {
  const fwd = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`,
    'iu'
  );
  const bwd = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`,
    'iu'
  );
  const match = fwd.exec(html) ?? bwd.exec(html);
  return match?.[1];
}

function extractEmbedContext(html: string): GqlNode | null {
  const marker = '"init",[],[';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  const scanEnd = Math.min(html.length, start + marker.length + 500000);
  for (let i = start + marker.length - 1; i < scanEnd; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const inner = html.slice(start + marker.length, end);
  const candidates: unknown[] = [];
  try {
    candidates.push(JSON.parse(inner));
  } catch {
    /* not a bare object */
  }
  try {
    candidates.push(JSON.parse(`[${inner}]`));
  } catch {
    /* not an arg list */
  }
  for (const candidate of candidates) {
    const pool = Array.isArray(candidate) ? candidate : [candidate];
    for (const entry of pool) {
      const ctxRaw = (entry as { contextJSON?: unknown })?.contextJSON;
      if (typeof ctxRaw !== 'string') continue;
      try {
        const ctx = JSON.parse(ctxRaw) as {
          gql_data?: {
            shortcode_media?: GqlNode;
            xdt_shortcode_media?: GqlNode;
          };
        };
        const node =
          ctx?.gql_data?.shortcode_media ??
          ctx?.gql_data?.xdt_shortcode_media ??
          null;
        if (node) return node;
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function parseEmbed(html: string): IgParsed | null {
  const ctx = extractEmbedContext(html);
  if (ctx) {
    const structured = parseGraphqlMedia(ctx);
    if (structured) return structured;
  }
  const videoMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/u);
  const raw = videoMatch?.[1]?.replace(/\\u0026/gu, '&').replace(/\\/gu, '');
  if (!raw) return null;
  return {
    id: null,
    title: ogMeta(html, 'og:title') || 'Instagram Video',
    uploader: 'Instagram User',
    thumbnail: ogMeta(html, 'og:image'),
    media: [{ url: raw, isVideo: true }],
  };
}

export type { GqlNode, IgProduct };
