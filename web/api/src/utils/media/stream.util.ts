import { Request, Response } from 'express';
import { logger } from '../infra/logger.util.js';
import { VideoInfo, Format } from '../../types/index.js';
import { sendEvent, sendBufferedEvent } from '../network/sse.util.js';
import { signProxyParams } from '../network/secrets.util.js';
import { buildPhoneMediaUrl } from '../../services/ytdlp/phone-media.js';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const isDirect = (format: Format): boolean =>
  Boolean(
    format.url &&
    !format.url.includes('youtube.com/watch') &&
    !format.url.includes('youtu.be/') &&
    (!format.note ||
      (!format.note.includes('m3u8') && !format.note.includes('manifest'))) &&
    !format.url.includes('.m3u8')
  );

export const isAvc = (format: Format | null | undefined): boolean => {
  if (!format) return false;
  const vcodec = format.vcodec || '';
  return vcodec.startsWith('avc1') || vcodec.startsWith('h264');
};

export function selectVideoFormat(
  formats: Format[],
  formatId: string | undefined
): Format | null {
  const isMuxed = (targetFormat: Format) =>
    targetFormat.vcodec !== 'none' && targetFormat.acodec !== 'none';
  const videoFormats = formats.filter(
    (format) => format.vcodec && format.vcodec !== 'none'
  );

  if (videoFormats.length === 0) return null;

  const h264Formats = videoFormats.filter(
    (format) =>
      format.vcodec?.startsWith('avc1') || format.vcodec?.startsWith('h264')
  );

  const available = (h264Formats.length > 0 ? h264Formats : videoFormats).sort(
    (formatA, formatB) => {
      const heightA = formatA.height || 0;
      const heightB = formatB.height || 0;
      if (heightB !== heightA) return heightB - heightA;
      if (isMuxed(formatB) && !isMuxed(formatA)) return 1;
      return -1;
    }
  );

  const requested = videoFormats.find(
    (format) => String(format.formatId) === String(formatId)
  );
  if (requested) return requested;

  return (
    available.find((format) => (format.height || 0) <= 1080) || available[0]
  );
}

export function selectAudioFormat(
  formats: Format[],
  formatId: string | undefined,
  isAudioOnly: boolean,
  needsWebm: boolean,
  audioLang?: string
): Format | null {
  const availableAudioOnly = formats.filter(
    (format) =>
      format.acodec !== 'none' && (format.vcodec === 'none' || !format.isVideo)
  );

  const langPool = pickAudioLanguagePool(availableAudioOnly, audioLang);
  const audioAbr = (format: Format) =>
    Number(format.abr) || parseInt(format.quality || '0', 10) || 0;

  const m4aAudio = langPool
    .filter((format) => format.extension === 'm4a')
    .sort((formatA, formatB) => audioAbr(formatB) - audioAbr(formatA))[0];
  const webmAudio = langPool
    .filter((format) => format.extension === 'webm' || format.acodec === 'opus')
    .sort((formatA, formatB) => audioAbr(formatB) - audioAbr(formatA))[0];

  const requested = isAudioOnly
    ? formats.find((format) => String(format.formatId) === String(formatId))
    : null;

  return (
    (requested as Format) ||
    (needsWebm && webmAudio ? webmAudio : m4aAudio || webmAudio) ||
    langPool.find((format) => format.acodec !== 'none') ||
    formats.find((format) => format.acodec !== 'none') ||
    null
  );
}

export function pickAudioLanguagePool(
  pool: Format[],
  audioLang?: string
): Format[] {
  if (pool.length === 0) return pool;
  const hasLangMeta = pool.some((format) => format.language || format.isOriginal);
  if (!hasLangMeta) return pool;

  if (audioLang) {
    const wanted = audioLang.toLowerCase();
    const exact = pool.filter(
      (format) => (format.language || '').toLowerCase() === wanted
    );
    if (exact.length) return exact;
    // base-language fallback: "es" matches "es-419"
    const base = wanted.split('-')[0];
    const baseMatch = pool.filter(
      (format) => (format.language || '').split('-')[0].toLowerCase() === base
    );
    if (baseMatch.length) return baseMatch;
  }

  const original = pool.filter((format) => format.isOriginal);
  if (original.length) return original;

  return pool;
}

export function buildProxyUrl(
  req: Request,
  format: Format | null | undefined,
  targetUrl: string
): string | null {
  if (!format?.formatId) return null;

  const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;

  const rawUrl = isDirect(format) ? format.url : undefined;
  const formatId = String(format.formatId);
  const phoneUrl = buildPhoneMediaUrl(rawUrl, targetUrl);
  if (phoneUrl) {
    logger.info(`[Download] fmt ${formatId}: via phone relay`);
    return phoneUrl;
  }
  logger.info(`[Download] fmt ${formatId}: via server proxy`);

  const { exp, sig } = signProxyParams({ targetUrl, rawUrl, formatId });

  let proxyUrl = `${protocol}://${host}/proxy?targetUrl=${encodeURIComponent(targetUrl)}&formatId=${formatId}&ext=${format.extension || 'mp4'}`;
  if (rawUrl) {
    proxyUrl += `&rawUrl=${encodeURIComponent(rawUrl)}`;
  }
  return `${proxyUrl}&exp=${exp}&sig=${sig}`;
}

export function getOutputMetadata(
  isAudioOnly: boolean,
  emeExtension: string,
  info: VideoInfo
) {
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    webm: isAudioOnly ? 'audio/webm' : 'video/webm',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };

  const type =
    mimeMap[emeExtension] ||
    (isAudioOnly ? `audio/${emeExtension}` : 'video/mp4');

  return {
    type,
    metadata: {
      title: info.title,
      artist: info.uploader || info.artist,
    },
  };
}

export function setupStreamListeners(
  videoProcess: NodeJS.ReadableStream,
  res: Response,
  clientId: string | undefined,
  totalBytesSent: { value: number }
) {
  let lastReportedProgress = 30;

  if (clientId) {
    sendEvent(clientId, {
      status: 'downloading',
      progress: 30,
      subStatus: 'STREAMING: Initializing Handshake...',
    });
  }

  const readable = videoProcess as unknown as NodeJS.EventEmitter & {
    pipe: (res: Response) => void;
  };
  if (typeof readable.on === 'function') {
    readable.on('progress', (progress: number) => {
      if (clientId) {
        const scaledProgress = 30 + progress * 0.65;
        const newProgress = Math.min(95, Math.round(scaledProgress));

        if (newProgress > lastReportedProgress) {
          lastReportedProgress = newProgress;
          sendBufferedEvent(clientId, {
            status: 'downloading',
            progress: newProgress,
            subStatus: `STREAMING: ${progress.toFixed(1)}%`,
          });
        }
      }
    });
  }

  let heartbeatTimer: NodeJS.Timeout | null = null;
  const startHeartbeat = () => {
    // tcp keep-alive prevents body corruption
    if (res.socket && !res.socket.destroyed) {
      res.socket.setKeepAlive(true, 25000);
    }
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const progressObserver = new Transform({
    highWaterMark: 64 * 1024,
    transform(chunk, encoding, callback) {
      stopHeartbeat();
      totalBytesSent.value += chunk.length;

      if (totalBytesSent.value === chunk.length) {
        logger.info(
          `[StreamUtil] First chunk received for client ${clientId} (${chunk.length} bytes)`
        );
        if (clientId) {
          sendEvent(clientId, {
            status: 'downloading',
            progress: lastReportedProgress,
            subStatus: 'TRANSMITTING: Streaming via Turbo',
          });
        }
      }

      startHeartbeat();
      callback(null, chunk);
    },
    flush(callback) {
      stopHeartbeat();
      callback();
    },
  });

  startHeartbeat();

  const onStreamComplete = () => {
    logger.info(
      `[StreamUtil] Stream closed for client ${clientId} (Total: ${(totalBytesSent.value / (1024 * 1024)).toFixed(1)}MB)`
    );
    if (clientId) {
      sendEvent(clientId, {
        status: 'completed',
        progress: 100,
        subStatus: `STREAMING: Finalized (${(totalBytesSent.value / (1024 * 1024)).toFixed(1)}MB)`,
      });
    }
  };

  if (typeof readable.pipe === 'function') {
    // pipeline ends res; early end truncates tail
    pipeline(
      videoProcess as unknown as import('stream').Readable,
      progressObserver,
      res
    )
      .then(onStreamComplete)
      .catch((error) => {
        if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          logger.error('[Stream] Pipeline failed:', error.message);
        }
      });
  } else {
    videoProcess.on('close', () => {
      onStreamComplete();
      if (!res.writableEnded) res.end();
    });
  }

  videoProcess.on('error', (error: unknown) => {
    const typedError = error as NodeJS.ErrnoException;
    if (typedError.code === 'ERR_STREAM_WRITE_AFTER_END') return;
    logger.error('[Convert] Stream Error:', typedError.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream generation failed' });
    } else {
      if (!res.writableEnded) res.end();
    }
  });
}
