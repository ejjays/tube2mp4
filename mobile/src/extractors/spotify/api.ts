import { gatedFetch } from '../../lib/net';
import { mobileSharedEnv } from '../shared/env';
import {
  parseTrackId,
  parseEmbedHtml,
  fetchSpotifyEmbed as sharedFetchEmbed,
  fetchOdesli as sharedFetchOdesli,
} from '@phantom/extractors/spotify';
import type {
  SpotifyEmbed,
  SpotifyMeta,
  SpotifyOdesliResult,
} from '@phantom/extractors';

export { parseTrackId, parseEmbedHtml };
export type { SpotifyEmbed, SpotifyMeta };
export type OdesliResult = SpotifyOdesliResult;

export interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover?: string;
  durationMs: number;
  isrc?: string;
  previewUrl?: string;
}

interface SpotifyApiTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_ids: { isrc?: string };
  preview_url?: string | null;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const { supabase } = await import('../../lib/social/supabase');
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke<{
      access_token?: string;
      expires_in?: number;
    }>('spotify-token');
    if (error || !data?.access_token) return null;
    const expiresIn = data.expires_in ?? 3600;
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    };
    return tokenCache.token;
  } catch {
    return null;
  }
}

export async function fetchSpotifyTrack(
  trackId: string
): Promise<SpotifyTrack | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await gatedFetch(
      `https://api.spotify.com/v1/tracks/${trackId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) return null;
    const track = (await res.json()) as SpotifyApiTrack;
    return {
      id: track.id,
      title: track.name,
      artist: (track.artists || []).map((a) => a.name).join(', '),
      album: track.album?.name || '',
      cover: track.album?.images?.[0]?.url,
      durationMs: track.duration_ms || 0,
      isrc: track.external_ids?.isrc,
      previewUrl: track.preview_url || undefined,
    };
  } catch {
    return null;
  }
}

export function fetchSpotifyEmbed(
  trackId: string
): Promise<SpotifyEmbed | null> {
  return sharedFetchEmbed(trackId, mobileSharedEnv);
}

export function fetchOdesli(trackId: string): Promise<OdesliResult | null> {
  return sharedFetchOdesli(trackId, mobileSharedEnv);
}
