import { isHost } from '../../utils/network/host.util.js';
import { Request } from 'express';
import { logger } from '../../utils/infra/logger.util.js';
import { getCookieArgs } from '../../utils/api/controller.util.js';
import { getVideoInfo } from '../ytdlp.service.js';
import {
  isAvc,
  isDirect,
  selectVideoFormat,
  selectAudioFormat,
  buildProxyUrl,
  getOutputMetadata,
} from '../../utils/media/stream.util.js';
import { estimateFilesize } from '../../utils/media/format.util.js';
import { getSanitizedFilename } from '../../utils/media/video.util.js';
import { decodeUrlIfNeeded } from '../../utils/network/validation.util.js';
import { VideoInfo, Format } from '../../types/index.js';

export function resolveFormatDetails(
  info: VideoInfo,
  formatId: string,
  isSpotify: boolean,
  audioLang?: string
) {
  const requestedFormat = info.formats.find(
    (format: Format) => String(format.formatId) === String(formatId)
  );
  // missing format is not audio-only
  const isAudioStream = (format: Format | undefined) =>
    Boolean(format) && (!format?.vcodec || format.vcodec === 'none');
  const isAudioOnly =
    formatId === 'mp3' || isSpotify || isAudioStream(requestedFormat);

  const finalVideoFormat = isAudioOnly
    ? null
    : selectVideoFormat(info.formats, formatId);
  const hasAudio = (format: Format | null) =>
    Boolean(format?.acodec && format?.acodec !== 'none');
  const needsWebm = Boolean(finalVideoFormat && !isAvc(finalVideoFormat));

  // audioUrl means a separate audio stream
  const pairedAudioUrl =
    !isAudioOnly && typeof finalVideoFormat?.audioUrl === 'string'
      ? finalVideoFormat.audioUrl
      : null;

  let finalAudioFormat: Format | null;
  if (pairedAudioUrl) {
    finalAudioFormat = {
      formatId: `${finalVideoFormat?.formatId ?? 'edge'}-audio`,
      url: pairedAudioUrl,
      extension: 'm4a',
      acodec: 'aac',
      vcodec: 'none',
      isAudio: true,
      isVideo: false,
      isMuxed: false,
    };
  } else if (isAudioOnly || !hasAudio(finalVideoFormat)) {
    // include audioFormats so dash picks audio-only
    const audioPool = [...info.formats, ...(info.audioFormats ?? [])];
    finalAudioFormat = selectAudioFormat(
      audioPool,
      formatId,
      isAudioOnly,
      needsWebm,
      audioLang
    );
  } else {
    finalAudioFormat = null;
  }

  return { isAudioOnly, finalVideoFormat, finalAudioFormat, requestedFormat };
}

function determineExtension(
  isAudioOnly: boolean,
  finalVideoFormat: Format | null,
  finalAudioFormat: Format | null,
  requestedFormat: Format | undefined,
  formatId: string
) {
  let emeExtension = isAudioOnly ? finalAudioFormat?.extension || 'mp3' : 'mp4';
  if (formatId.startsWith('photo')) {
    emeExtension = requestedFormat?.extension || 'jpg';
  } else if (finalVideoFormat) {
    emeExtension = 'mp4';
  }
  return emeExtension;
}

export function buildStreamResponse(
  info: VideoInfo,
  videoTunnel: string | null | undefined,
  audioTunnel: string | null | undefined,
  isAudioOnly: boolean,
  filename: string,
  totalSize: number,
  outputMeta: Record<string, unknown>,
  directUrl?: string
) {
  if (videoTunnel && audioTunnel && !isAudioOnly) {
    return {
      status: 'local-processing',
      type: 'proxy',
      tunnel: [videoTunnel, audioTunnel],
      output: { filename, totalSize, ...outputMeta },
      videoUrl: videoTunnel,
      audioUrl: audioTunnel,
      title: info.title,
      filename,
    };
  }

  const tunnelPath = videoTunnel || audioTunnel;
  if (!tunnelPath || tunnelPath.includes('PENDING_DECIPHER')) {
    throw new Error(
      'No valid proxy tunnel could be resolved or stream is encrypted.'
    );
  }

  return {
    status: 'local-processing',
    type: 'proxy',
    tunnel: [tunnelPath],
    output: { filename, totalSize, ...outputMeta },
    videoUrl: isAudioOnly ? undefined : videoTunnel,
    audioUrl: audioTunnel,
    title: info.title,
    filename,
    directUrl,
  };
}

export function parseRequestParams(req: Request) {
  const videoURLParam = req.query.url as string;
  const clientId = (req.query.id as string) || undefined;
  const formatId = req.query.formatId as string;
  const audioLang = (req.query.audioLang as string) || undefined;

  const decoded = decodeUrlIfNeeded(videoURLParam);
  const videoURL = decoded ? decoded.split('&id=')[0].split('?id=')[0] : '';
  return { videoURL, clientId, formatId, audioLang };
}

export async function resolveManifests(
  req: Request,
  videoURL: string,
  clientId: string | undefined,
  formatId: string
) {
  const cookieArgs = await getCookieArgs(videoURL, clientId);
  let info: VideoInfo | null = await getVideoInfo(
    videoURL,
    cookieArgs,
    false,
    null,
    clientId,
    true
  ).catch(() => {
    /* ignore */ return null;
  });

  if (!info) throw new Error('Failed to fetch media information.');

  // download intent forces full decipher
  if (info.isPartial && req.query.full === '1') {
    const full = await getVideoInfo(
      videoURL,
      cookieArgs,
      true,
      null,
      clientId
    ).catch(() => null);
    if (full?.formats?.length) info = full;
  }

  const isSpotify = isHost(videoURL, 'spotify.com');
  const resolvedTargetURL = isSpotify ? info.targetUrl || videoURL : videoURL;

  const audioLang = (req.query.audioLang as string) || undefined;
  const { isAudioOnly, finalVideoFormat, finalAudioFormat, requestedFormat } =
    resolveFormatDetails(info, formatId, isSpotify, audioLang);

  const videoTunnel = buildProxyUrl(
    req,
    finalVideoFormat,
    resolvedTargetURL as string
  );
  const audioTunnel = buildProxyUrl(
    req,
    finalAudioFormat,
    resolvedTargetURL as string
  );

  // raw url for open-cors direct download
  const directUrl =
    !isAudioOnly &&
    !finalAudioFormat &&
    finalVideoFormat &&
    isDirect(finalVideoFormat)
      ? finalVideoFormat.url
      : undefined;

  const emeExtension = determineExtension(
    isAudioOnly,
    finalVideoFormat,
    finalAudioFormat,
    requestedFormat,
    formatId
  );
  const filename = getSanitizedFilename(
    info.title,
    info.uploader,
    emeExtension,
    isSpotify
  );
  const outputMeta = getOutputMetadata(isAudioOnly, emeExtension, info);

  let totalSize = 0;
  try {
    totalSize =
      (estimateFilesize(
        finalVideoFormat || ({} as Format),
        info.duration || 0
      ) || 0) +
      (estimateFilesize(
        finalAudioFormat || ({} as Format),
        info.duration || 0
      ) || 0);
  } catch (error: unknown) {
    logger.warn('[Size] Estimation failed:', (error as Error).message);
  }

  return {
    info,
    videoTunnel,
    audioTunnel,
    isAudioOnly,
    filename,
    totalSize,
    outputMeta,
    directUrl,
  };
}
