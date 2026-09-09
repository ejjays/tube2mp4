// shared across platforms; small enough to live alongside the env contract
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const DESKTOP_UA = UA;
export const VIMEO_REFERER = 'https://vimeo.com/';

// x.com dispatch + caption t.co stripping
export const TCO_URL_RE = /https:\/\/t\.co\/\S{1,500}/u;

// sum #EXTINF segments; one shared util beats three copies drifting
export function hlsDurationSec(playlist: string): number {
  let total = 0;
  for (const match of playlist.matchAll(/#EXTINF:([\d.]+)/gu)) {
    total += Number(match[1]);
  }
  return Number.isFinite(total) ? total : 0;
}

// bits/s * s / 8 = bytes
export function estimateSize(
  bandwidth: number | undefined,
  durationSec: number
): number | undefined {
  if (!bandwidth || !durationSec) return undefined;
  return Math.round((bandwidth / 8) * durationSec);
}

// mobile uses protocol-relative etc. — coerce to absolute
export function normalizeUrl(
  href: string,
  base: string
): string | undefined {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/giu,
    (entity, code: string) => {
      if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
      switch (code.toLowerCase()) {
        case 'amp': return '&';
        case 'lt': return '<';
        case 'gt': return '>';
        case 'quot': return '"';
        default: return "'";
      }
    }
  );
}