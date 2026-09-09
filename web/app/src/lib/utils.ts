import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const isHost = (url: string, host: string) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === host || hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
};

export const formatSize = (bytes?: number) => {
  if (!bytes) return 'Unknown size';
  const kiloBytes = bytes / 1000;
  const megaBytes = kiloBytes / 1000;
  const gigaBytes = megaBytes / 1000;

  if (gigaBytes >= 1) return `${gigaBytes.toFixed(2)} GB`;
  if (megaBytes >= 1) return `${megaBytes.toFixed(1)} MB`;
  return `${Math.round(kiloBytes)} KB`;
};

export const getQualityLabel = (quality?: string) => {
  if (!quality) return 'Unknown';
  if (quality.includes('4320')) return '8K';
  if (quality.includes('2160')) return '4K';
  if (quality.includes('1440')) return '2K';
  return quality.replace(/\(Original\s*Master\)/gi, '').trimEnd();
};

export const getSanitizedFilename = (
  title: string,
  artist: string,
  format: string,
  isSpotifyRequest: boolean
) => {
  let displayTitle = title;
  if (isSpotifyRequest && artist) displayTitle = `${artist} - ${displayTitle}`;

  // clean punctuation
  let sanitized = displayTitle
    .replace(/[<>:"/|?*]/g, '') // illegal chars
    .replace(/[\r\n\t]+/g, ' ') // newlines
    .replace(/\s+/g, ' ') // collapse spaces
    .trim();

  // truncate titles
  const MAX_LENGTH = 64;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = `${sanitized.substring(0, MAX_LENGTH).trim()}...`;
  }

  return `${sanitized || 'video'}.${format}`;
};

export const generateUUID = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
