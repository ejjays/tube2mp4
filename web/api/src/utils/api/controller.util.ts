import { isHost } from '../network/host.util.js';
import { existsSync, readFileSync } from 'node:fs';
import { logger } from '../infra/logger.util.js';
import { sendEvent } from '../network/sse.util.js';
import { getCookieType } from '../media/video.util.js';
import { downloadCookies } from '../network/cookie.util.js';
import { isValidProxyUrl } from '../network/validation.util.js';
import { getVideoInfo } from '../../services/ytdlp.service.js';
import {
  getBestThumbnail,
  proxyThumbnailIfNeeded,
} from '../../services/social.service.js';
import {
  VideoInfo,
  SpotifyMetadata,
  Format,
  SSEEvent,
} from '../../types/index.js';

export async function getCookieArgs(
  videoURL: string,
  clientId: string | undefined,
  status = 'initializing'
): Promise<string[]> {
  const cookieType = getCookieType(videoURL);
  const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
  if (clientId) {
    sendEvent(clientId, {
      status: (status === 'fetching_info'
        ? 'initializing'
        : status) as SSEEvent['status'],
      progress: 8,
      subStatus: 'Bypassing restricted clients...',
      details: 'AUTH: BYPASSING_PROTOCOL_RESTRICTIONS',
    });
  }
  return cookiesPath ? ['--cookies', cookiesPath] : [];
}

export function initializeSession(
  clientId: string | undefined,
  status = 'initializing'
): void {
  if (!clientId) return;
  sendEvent(clientId, {
    status: (status === 'fetching_info'
      ? 'initializing'
      : status) as SSEEvent['status'],
    progress: 3,
    subStatus: 'Initializing Session...',
    details: 'SESSION: STARTING_SECURE_CONTEXT',
  });
}

export function logExtractionSteps(
  clientId: string | undefined,
  serviceName: string,
  step = 1
): void {
  if (!clientId) return;
  const steps = [
    {
      progress: 12,
      subStatus: `Extracting ${serviceName} Metadata...`,
      details: 'ENGINE_YTDLP: INITIATING_CORE_EXTRACTION',
    },
    {
      progress: 18,
      subStatus: 'Analyzing Server-Side Signatures...',
      details: 'NETWORK_HANDSHAKE: ESTABLISHING_SECURE_TUNNEL',
    },
    {
      progress: 24,
      subStatus: `Verifying ${serviceName} Handshake...`,
      details: 'AUTH_GATEWAY: BYPASSING_PROTOCOL_RESTRICTIONS',
    },
  ];

  const currentStep = steps[step - 1] || steps[0];
  sendEvent(clientId, {
    status: 'initializing',
    ...currentStep,
  });
}

export function handleBrainHit(
  videoURL: string,
  targetURL: string,
  spotifyData: SpotifyMetadata,
  cookieArgs: string[],
  clientId: string | undefined
): void {
  if (!spotifyData.cover || spotifyData.cover === '/logo.webp') {
    (async () => {
      try {
        const info = await getVideoInfo(targetURL, cookieArgs);
        let finalThumbnail = getBestThumbnail(info);
        finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);
        if (clientId) {
          sendEvent(clientId, {
            status: 'initializing',
            text: JSON.stringify({
              metadata_update: {
                cover: finalThumbnail,
                title: spotifyData.title,
                artist: spotifyData.artist,
              },
            }),
          });
        }

        // only save ISRC
        if (spotifyData.fromBrain) {
          const { saveToBrain } =
            await import('../../services/spotify.service.js');
          saveToBrain(videoURL, { ...spotifyData, cover: finalThumbnail });
        }
      } catch (err: unknown) {
        logger.debug(
          '[ControllerUtil] Brain hit handle error:',
          (err as Error).message
        );
      }
    })();
  }
}

export async function resolveConvertTarget(
  videoURL: string,
  targetURL: string | undefined,
  cookieArgs: string[]
): Promise<string> {
  if (targetURL && !isValidProxyUrl(targetURL)) {
    logger.warn('[Security] Blocked invalid targetUrl in resolve');
    return videoURL;
  }

  if (
    targetURL &&
    (isHost(targetURL, 'youtube.com') || isHost(targetURL, 'youtu.be'))
  )
    return targetURL;

  if (isHost(videoURL, 'spotify.com')) {
    let info: VideoInfo | null = await getVideoInfo(videoURL, cookieArgs).catch(
      () => null
    );

    if (info?.isPartial) {
      // wait background resolution
      info = await getVideoInfo(videoURL, cookieArgs, false).catch(() => null);
    }

    if (info?.targetUrl) {
      return info.targetUrl;
    }
  }

  return videoURL;
}

export async function resolveTargetFormat(
  format: string,
  _streamURL: string,
  resolvedTargetURL: string,
  cookieArgs: string[],
  formatId: string | undefined,
  _clientId: string | undefined,
  videoURL: string | null = null
): Promise<{
  info: VideoInfo | null;
  targetFormat?: VideoInfo['formats'][number];
  streamURL: string;
}> {
  const urlToUse = videoURL || resolvedTargetURL;

  let info: VideoInfo | null = await getVideoInfo(
    urlToUse,
    cookieArgs,
    false,
    null,
    null,
    true
  ).catch(() => null);

  if (!info) {
    const { getInfo } = await import('../../services/extractors/index.js');

    // parse cookies
    let rawCookie: string | null = null;
    if (cookieArgs?.includes('--cookies')) {
      const cookiePath = cookieArgs[cookieArgs.indexOf('--cookies') + 1];
      if (cookiePath && existsSync(cookiePath)) {
        const content = readFileSync(cookiePath, 'utf8');
        const lines = content.split('\n');
        const pairs: string[] = [];
        for (const line of lines) {
          if (!line.trim() || line.startsWith('#')) continue;
          const parts = line.split('\t');
          if (parts.length >= 7)
            pairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
        }
        rawCookie = pairs.join('; ');
      }
    }

    info = await getInfo(urlToUse, {
      cookie: rawCookie || cookieArgs.join('; '),
    }).catch(() => null);
  }

  if (!info) return { info: null, streamURL: _streamURL };

  const isAudioOnly = ['mp3', 'm4a', 'audio'].includes(format);
  let targetFormat = info.formats.find(
    (item: Format) => String(item.formatId) === String(formatId)
  );

  if (!targetFormat) {
    if (isAudioOnly) {
      targetFormat = info.formats
        .filter(
          (item: Format) =>
            (item.acodec !== 'none' || item.isAudio) &&
            (item.vcodec === 'none' || !item.isVideo)
        )
        .sort(
          (formatA: Format, formatB: Format) =>
            (formatB.abr || 0) - (formatA.abr || 0)
        )[0];

      if (!targetFormat) {
        targetFormat = info.formats
          .filter((item: Format) => item.acodec !== 'none' || item.isAudio)
          .sort(
            (formatA: Format, formatB: Format) =>
              (formatB.abr || 0) - (formatA.abr || 0)
          )[0];
      }
    } else {
      targetFormat = info.formats
        .filter(
          (item: Format) => item.vcodec !== 'none' && item.acodec !== 'none'
        )
        .sort(
          (formatA: Format, formatB: Format) =>
            (Number(formatB.height) || 0) - (Number(formatA.height) || 0)
        )[0];

      if (!targetFormat) {
        targetFormat = info.formats
          .filter((item: Format) => item.vcodec !== 'none')
          .sort(
            (formatA: Format, formatB: Format) =>
              (Number(formatB.height) || 0) - (Number(formatA.height) || 0)
          )[0];
      }
    }
  }

  return { info, targetFormat, streamURL: _streamURL };
}
