import { isHost } from '../network/host.util.js';
import { Response } from 'express';
import { logger } from '../infra/logger.util.js';
import {
  VideoInfo,
  SpotifyMetadata,
  FinalResponse,
} from '../../types/index.js';
import { FinalResponseSchema } from '@phantom/shared/schemas/media.schema';
import {
  processVideoFormats,
  processAudioFormats,
} from '../media/format.util.js';
import {
  normalizeTitle,
  normalizeArtist,
  getBestThumbnail,
  proxyThumbnailIfNeeded,
} from '../../services/social.service.js';

async function _resolveThumbnail(
  info: VideoInfo,
  isSpotify: boolean,
  spotifyData: SpotifyMetadata | null,
  videoURL: string
): Promise<string> {
  const spotifyImg =
    spotifyData?.cover ||
    spotifyData?.thumbnail ||
    info?.thumbnail ||
    info?.cover;
  let finalThumbnail = getBestThumbnail(info);

  if (isSpotify && spotifyImg) {
    finalThumbnail = await proxyThumbnailIfNeeded(spotifyImg, videoURL);
  } else {
    finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);
  }
  return finalThumbnail || '/logo.webp';
}

function _getSpotifyPayload(
  info: VideoInfo,
  spotifyData: SpotifyMetadata,
  videoURL: string
) {
  return {
    id: info.id || spotifyData.id || videoURL,
    title: spotifyData.title || info.title,
    artist: spotifyData.artist || info.artist || 'Unknown',
    uploader: spotifyData.artist || info.artist || info.uploader,
    album: spotifyData.album || info.album || '',
    previewUrl: spotifyData.previewUrl || info.previewUrl,
  };
}

function _mapFinalMetadata(
  info: VideoInfo,
  spotifyData: SpotifyMetadata | null,
  finalTitle: string,
  finalArtist: string,
  finalThumbnail: string,
  isSpotify: boolean,
  videoURL: string
): FinalResponse {
  videoURL = typeof videoURL === 'string' ? videoURL : '';
  const isPartial = Boolean(info.isPartial);
  const isIsrcMatch = Boolean(info.isIsrcMatch);
  const isJsInfo = Boolean(info.isJsInfo);

  // youtube keeps raw title; social normalized
  const isYouTube =
    isHost(videoURL, 'youtube.com') || isHost(videoURL, 'youtu.be');

  const base =
    isSpotify && spotifyData
      ? _getSpotifyPayload(info, spotifyData, videoURL)
      : {
          id: info.id || videoURL,
          title: isYouTube
            ? info.title || finalTitle
            : finalTitle || info.title,
          artist: finalArtist || info.artist || 'Unknown',
          uploader: finalArtist || info.artist || info.uploader,
          album: info.album || '',
          previewUrl: info.previewUrl || null,
        };

  const payload = {
    ...base,
    cover: finalThumbnail,
    thumbnail: finalThumbnail,
    duration: info.duration,
    formats: processVideoFormats(info),
    // keep audio split out by normalizers
    audioFormats: info.audioFormats?.length
      ? info.audioFormats
      : processAudioFormats(info),
    spotifyMetadata: spotifyData
      ? { ...spotifyData, type: 'spotify' as const }
      : undefined,
    isPartial,
    isrc: spotifyData?.isrc || info.isrc,
    isIsrcMatch,
    isJsInfo,
    webpageUrl: videoURL,
  };

  return FinalResponseSchema.parse(payload);
}

export async function prepareFinalResponse(
  info: VideoInfo,
  isSpotify: boolean,
  spotifyData: SpotifyMetadata | null,
  videoURL: string
): Promise<FinalResponse> {
  const finalThumbnail = await _resolveThumbnail(
    info,
    isSpotify,
    spotifyData,
    videoURL
  );
  const finalTitle = normalizeTitle(info);
  const finalArtist = normalizeArtist(info);

  if (isSpotify) {
    const preview = spotifyData?.previewUrl || info.previewUrl;
    if (preview) {
      logger.info(`[Response] Sending Preview: ${preview.substring(0, 50)}...`);
    } else {
      logger.info(
        `[Response] No Preview found for ${spotifyData?.title || info.title}`
      );
    }
  }

  return _mapFinalMetadata(
    info,
    spotifyData,
    finalTitle,
    finalArtist,
    finalThumbnail,
    isSpotify,
    videoURL
  );
}

export function prepareBrainResponse(spotifyData: SpotifyMetadata) {
  const duration =
    spotifyData.duration ||
    (spotifyData.audioFeatures?.duration_ms
      ? spotifyData.audioFeatures.duration_ms / 1000
      : 0);

  return {
    title: spotifyData.title,
    artist: spotifyData.artist,
    album: spotifyData.album,
    cover: spotifyData.cover || '/logo.webp',
    thumbnail: spotifyData.thumbnail || '/logo.webp',
    duration,
    previewUrl: spotifyData.previewUrl,
    formats: spotifyData.formats ?? [],
    audioFormats: spotifyData.audioFormats ?? [],
    spotifyMetadata: spotifyData,
  };
}

export function setupConvertResponse(
  res: Response,
  filename: string,
  format: string,
  _size = 0
) {
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    opus: 'audio/opus',
    ogg: 'audio/ogg',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };

  const safeName = encodeURIComponent(filename);
  const asciiName = filename.replaceAll(/[^\u0020-\u007E]/gu, '');

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName.replaceAll('"', '')}"; filename*=UTF-8''${safeName}`
  );
  res.setHeader(
    'Content-Type',
    mimeTypes[format] || 'application/octet-stream'
  );

  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  res.setHeader('Accept-Ranges', 'bytes');
}
