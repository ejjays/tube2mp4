import { File, Paths } from 'expo-file-system';
import { deleteAsync, moveAsync } from 'expo-file-system/legacy';
import { DESKTOP_UA } from '../userAgents';
import type { Format, VideoInfo } from '@phantom/extractors';
import { refererFor, type DownloadState } from '../format';
import { chunkedDownload } from './download';
import {
  muxVideoAudio,
  transcodeToMp3,
  demuxToM4a,
  hlsToMp4,
  parallelHlsToMp4,
  parallelHlsMuxedToMp4,
  tagAudio,
  extractFrame,
  remuxToMp4,
  encodeToMp4,
} from './mux';
import { saveToDevice } from './save';
import { checkStorageBeforeDownload } from './storagePreflight';
import { log } from '../log';
import { ABORT_MESSAGE } from '../retry';
import { upsertInflight, removeInflight, type InflightItem } from '../inflight';
import { addHistory } from '../downloadHistory';
import { resolve } from '../../extractors';
import {
  acquireCpuLock,
  acquireWifiLock,
  releaseCpuLock,
  releaseWifiLock,
} from '../../../modules/wake-lock';

export type DownloadOutcome = { status: 'saved' | 'denied'; uri?: string };

export type RunDownloadInput = {
  info: VideoInfo;
  format: Format;
  stem: string;
  tag?: { title?: string; artist?: string };
  signal: AbortSignal;
  onState: (state: DownloadState) => void;
  /** reuse stored progress (resume path) instead of starting at 0 */
  seed?: InflightItem;
};

const removeFile = (file: File): Promise<void> =>
  deleteAsync(file.uri, { idempotent: true }).catch(() => undefined);

const BYTES_PER_MB = 1048576;
const mb = (bytes: number): string => (bytes / BYTES_PER_MB).toFixed(1);

function buildInflight(
  info: VideoInfo,
  format: Format,
  stem: string,
  tag: { title?: string; artist?: string } | undefined,
  seed?: InflightItem
): InflightItem {
  const pick = <T>(a: T | undefined, fallback: T): T =>
    a !== undefined ? a : fallback;
  return {
    id: stem,
    title: pick(seed?.title, info.title),
    author: pick(seed?.author, info.uploader),
    platform: pick(seed?.platform, info.extractorKey ?? ''),
    ext: pick(seed?.ext, format.extension || 'mp4'),
    isAudio: pick(seed?.isAudio, format.isAudio && !format.isVideo),
    thumbnail: pick(seed?.thumbnail, info.thumbnail),
    progress: pick(seed?.progress, 0),
    updatedAt: Date.now(),
    info: {
      title: pick(seed?.info.title, info.title),
      uploader: pick(seed?.info.uploader, info.uploader),
      album: pick(seed?.info.album, info.album),
      thumbnail: pick(seed?.info.thumbnail, info.thumbnail),
      duration: pick(seed?.info.duration, info.duration),
      extractorKey: pick(seed?.info.extractorKey, info.extractorKey),
      downloadHeaders: pick(seed?.info.downloadHeaders, info.downloadHeaders),
    },
    format: pick(seed?.format, format),
    tag: pick(seed?.tag, tag),
  };
}

async function tagAudioInPlace(
  saveTarget: File,
  stem: string,
  info: VideoInfo,
  tag: { title?: string; artist?: string } | undefined,
  track: (file: File) => File
): Promise<void> {
  let cover: File | undefined;
  if (info.thumbnail) {
    try {
      const art = track(new File(Paths.cache, `${stem}.cover.jpg`));
      await File.downloadFileAsync(info.thumbnail, art, { idempotent: true });
      cover = art;
    } catch {
      /* cover optional */
    }
  }
  const saveExt = saveTarget.name.split('.').pop() || 'm4a';
  const tagged = track(new File(Paths.cache, `${stem}.tagged.${saveExt}`));
  const ok = await tagAudio(
    saveTarget,
    tagged,
    {
      title: tag?.title || info.title,
      artist: tag?.artist || info.uploader,
      album: info.album,
    },
    cover
  );
  if (ok) {
    await removeFile(saveTarget);
    await moveAsync({ from: tagged.uri, to: saveTarget.uri });
  }
}

// signed cdn urls expire (googlevideo, spotify) — match the failed stream
// against a fresh resolve so a retry never reuses the dead url
async function refreshStreamUrl(
  info: VideoInfo,
  format: Format,
  url: string
): Promise<string | null> {
  const fresh = await resolve(info.webpageUrl, undefined, { fresh: true });
  if (!fresh || fresh.formats.length === 0) return null;
  const match =
    fresh.formats.find((f) => f.formatId === format.formatId) ??
    fresh.formats[0];
  if (url === format.url) return match.url || null;
  if (url === format.muxAudioUrl) return match.muxAudioUrl || null;
  return null;
}

type FetchMediaInput = {
  info: VideoInfo;
  format: Format;
  stem: string;
  signal: AbortSignal;
  onState: (state: DownloadState) => void;
  report: (state: DownloadState) => void;
  track: (file: File) => File;
};

async function fetchMedia({
  info,
  format,
  stem,
  signal,
  onState,
  report,
  track,
}: FetchMediaInput): Promise<File> {
  const ext = format.extension || 'mp4';
  const headers = info.downloadHeaders ?? {
    'User-Agent': DESKTOP_UA,
    Referer: refererFor(info.extractorKey ?? ''),
  };

  const fetchTo = async (
    dlUrl: string,
    dest: File,
    base: number,
    cap: number,
    label: string,
    share?: { video: number; audio: number },
    shareKey?: 'video' | 'audio'
  ): Promise<void> => {
    const startedAt = Date.now();
    let written = 0;
    const onProg = (done: number, total: number): void => {
      written = done;
      // concurrent video+audio: combine the two streams into one
      // smooth 0-90 segment (video 80, audio 10 of it)
      if (share && shareKey) {
        share[shareKey] = total > 0 ? done / total : 0;
        report({
          status: 'downloading',
          progress: Math.round(share.video * 80 + share.audio * 10),
        });
      } else if (total > 0) {
        report({
          status: 'downloading',
          progress: base + Math.round((done / total) * cap),
        });
      }
    };
    const attempt = async (targetUrl: string): Promise<void> => {
      try {
        await chunkedDownload(targetUrl, headers, dest, onProg, signal);
      } catch (error) {
        if (!(error instanceof Error && /unknown size/iu.test(error.message))) {
          throw error;
        }
        // server without range support: plain single-shot download
        await File.downloadFileAsync(targetUrl, dest, {
          idempotent: true,
          headers,
          onProgress: ({ bytesWritten, totalBytes }) =>
            onProg(bytesWritten, totalBytes),
        });
      }
    };
    try {
      await attempt(dlUrl);
    } catch (error) {
      // cdn 403: the signed url got rejected on that edge node — some
      // (geo) nodes 403 what a sibling node serves. each fresh resolve
      // rolls a new node; try up to 3 rolls before giving up
      if (!(error instanceof Error && /chunked: HTTP/u.test(error.message))) {
        throw error;
      }
      let lastError = error;
      let reResolved = false;
      for (let roll = 0; roll < 3; roll += 1) {
        const freshUrl = await refreshStreamUrl(info, format, dlUrl);
        if (!freshUrl) throw lastError;
        try {
          await attempt(freshUrl);
          reResolved = true;
          break;
        } catch (retryError) {
          if (
            !(
              retryError instanceof Error &&
              /chunked: HTTP/u.test(retryError.message)
            )
          ) {
            throw retryError;
          }
          lastError = retryError;
        }
      }
      if (!reResolved) throw lastError;
      log('downloadPipeline', `[Download] ${label} url expired, re-resolved`);
    }
    if (signal.aborted) throw new Error(ABORT_MESSAGE);
    const secs = Math.max((Date.now() - startedAt) / 1000, 0.1);
    log(
      'downloadPipeline',
      `[Download] ${label} ${mb(written)}MB in ${secs.toFixed(1)}s (${(written / BYTES_PER_MB / secs).toFixed(1)} MB/s)`
    );
  };

  if (format.extension === 'mp3') {
    if (format.noTranscode) {
      const outFile = track(new File(Paths.cache, `${stem}.mp3`));
      await fetchTo(format.url, outFile, 0, 100, 'audio');
      return outFile;
    }
    const srcFile = track(new File(Paths.cache, `${stem}.audtmp`));
    await fetchTo(format.url, srcFile, 0, 85, 'audio');
    onState({ status: 'muxing', progress: 90 });
    const outFile = track(new File(Paths.cache, `${stem}.mp3`));
    const ok = await transcodeToMp3(srcFile, outFile);
    await removeFile(srcFile);
    if (!ok) throw new Error('MP3 conversion failed');
    return outFile;
  }
  if (format.audioDemux) {
    // audio-only from a muxed video: download it, copy the audio track out
    const srcFile = track(new File(Paths.cache, `${stem}.srctmp`));
    await fetchTo(format.url, srcFile, 0, 85, 'audio');
    onState({ status: 'muxing', progress: 90 });
    const outFile = track(new File(Paths.cache, `${stem}.m4a`));
    const ok = await demuxToM4a(srcFile, outFile);
    await removeFile(srcFile);
    if (!ok) throw new Error('Audio extraction failed');
    return outFile;
  }
  if (format.muxAudioUrl) {
    const videoFile = track(new File(Paths.cache, `${stem}.vid.${ext}`));
    const audioFile = track(
      new File(Paths.cache, `${stem}.aud.${format.muxAudioExt || 'm4a'}`)
    );
    // cdn throttles per-connection, so both files download at once —
    // two parallel region sets multiply aggregate bandwidth
    const share = { video: 0, audio: 0 };
    await Promise.all([
      fetchTo(format.url, videoFile, 0, 80, 'video', share, 'video'),
      fetchTo(format.muxAudioUrl, audioFile, 80, 10, 'audio', share, 'audio'),
    ]);
    onState({ status: 'muxing', progress: 92 });
    const outFile = track(new File(Paths.cache, `${stem}.${ext}`));
    const mStart = Date.now();
    const ok = await muxVideoAudio(videoFile, audioFile, outFile);
    log(
      'downloadPipeline',
      `[Download] mux ${ok ? 'ok' : 'failed'} in ${((Date.now() - mStart) / 1000).toFixed(1)}s`
    );
    await removeFile(videoFile);
    await removeFile(audioFile);
    if (!ok) throw new Error('Muxing failed');
    return outFile;
  }
  if (format.isHls) {
    const outFile = track(new File(Paths.cache, `${stem}.${ext}`));
    let durationSec = info.duration ?? 0;
    if (!durationSec) {
      try {
        const playlist = await (await fetch(format.url, { headers })).text();
        durationSec = [...playlist.matchAll(/#EXTINF:([\d.]+)/gu)].reduce(
          (sum, hit) => sum + Number(hit[1]),
          0
        );
      } catch {
        /* progress optional */
      }
    }
    onState({ status: 'downloading', progress: 0 });
    const hStart = Date.now();
    const onHls = (pct: number): void =>
      onState({ status: 'downloading', progress: Math.min(98, pct) });
    // separate video+audio hls -> parallel fetch; else ffmpeg
    let ok = false;
    let path = 'ffmpeg';
    if (format.hlsAudioUrl) {
      ok = await parallelHlsToMp4(
        format.url,
        format.hlsAudioUrl,
        outFile,
        headers,
        onHls,
        signal
      );
      if (ok) path = 'parallel';
    } else {
      ok = await parallelHlsMuxedToMp4(
        format.url,
        outFile,
        headers,
        onHls,
        signal
      );
      if (ok) path = 'parallel-muxed';
    }
    if (signal.aborted) throw new Error(ABORT_MESSAGE);
    if (!ok) {
      ok = await hlsToMp4(
        format.url,
        outFile,
        durationSec,
        onHls,
        format.hlsAudioUrl,
        format.hlsKeepAlive
      );
    }
    log(
      'downloadPipeline',
      `[Download] hls (${path}) ${ok ? 'ok' : 'failed'} in ${((Date.now() - hStart) / 1000).toFixed(1)}s`
    );
    if (signal.aborted) throw new Error(ABORT_MESSAGE);
    if (!ok) throw new Error('HLS download failed');
    // big 4k saves are slow; avoid a frozen-looking 98%
    onState({ status: 'muxing', progress: 99 });
    return outFile;
  }
  const destination = track(new File(Paths.cache, `${stem}.${ext}`));
  await fetchTo(format.url, destination, 0, 100, 'file');
  return destination;
}

export async function runDownload({
  info,
  format,
  stem,
  tag,
  signal,
  onState,
  seed,
}: RunDownloadInput): Promise<DownloadOutcome> {
  const temps: File[] = [];
  const track = (file: File): File => {
    temps.push(file);
    return file;
  };

  // keep CPU + Wi-Fi radio awake for the whole download; best-effort,
  // a lock failure must never fail the download itself
  await Promise.allSettled([
    acquireCpuLock('phantom-download'),
    acquireWifiLock('phantom-download'),
  ]);

  const inflight = buildInflight(info, format, stem, tag, seed);
  await upsertInflight(inflight);

  let lastReported = seed?.progress ?? 0;
  const report = (state: DownloadState): void => {
    onState(state);
    if (state.status === 'downloading') {
      // registry write per chunk is wasteful; persist on ~1% deltas only
      if (Math.abs(state.progress - lastReported) < 1) return;
      lastReported = state.progress;
      void upsertInflight({
        ...inflight,
        progress: state.progress,
        updatedAt: Date.now(),
      });
    }
  };

  // fail before writing anything: a half-empty disk kills downloads
  // midway and the kept partial bloats the resume path
  const gate = await checkStorageBeforeDownload(
    format.filesize ?? 0,
    info.duration
  );
  if (!gate.ok) {
    onState({ status: 'error', progress: 0 });
    await removeInflight(stem);
    throw new Error(gate.message);
  }

  let threw: unknown;
  try {
    let saveTarget = await fetchMedia({
      info,
      format,
      stem,
      signal,
      onState,
      report,
      track,
    });

    // every video lands as .mp4; copy when codecs allow, else re-encode
    if (
      format.isVideo &&
      !format.isAudio &&
      !saveTarget.name.toLowerCase().endsWith('.mp4')
    ) {
      onState({ status: 'muxing', progress: 99 });
      const mp4 = track(new File(Paths.cache, `${stem}.mp4`));
      const ok =
        (await remuxToMp4(saveTarget, mp4)) ||
        (await encodeToMp4(saveTarget, mp4));
      if (signal.aborted) throw new Error(ABORT_MESSAGE);
      if (!ok) throw new Error('MP4 conversion failed');
      await removeFile(saveTarget);
      saveTarget = mp4;
    }

    if (format.isAudio && !format.isVideo) {
      await tagAudioInPlace(saveTarget, stem, info, tag, track);
    }

    const saved = await saveToDevice(saveTarget, (pct) =>
      onState({ status: 'saving', progress: pct })
    );
    // paste-target media has no page art; grab a still before the temp dies
    let frameUri: string | undefined;
    if (saved.ok && format.isVideo && !inflight.thumbnail) {
      const thumb = new File(Paths.cache, `${stem}.thumb.jpg`);
      const ok = await extractFrame(saveTarget, thumb);
      if (ok) frameUri = thumb.uri;
      else await removeFile(thumb);
    }
    await removeFile(saveTarget);
    if (saved.ok) {
      await addHistory({
        id: stem,
        title: inflight.title,
        author: inflight.author,
        platform: inflight.platform,
        isAudio: inflight.isAudio,
        thumbnail: frameUri ?? inflight.thumbnail,
        ext: saveTarget.name.split('.').pop() || inflight.ext,
        uri: saved.uri,
        savedAt: Date.now(),
      });
    }
    return saved.ok
      ? { status: 'saved', uri: saved.uri }
      : { status: 'denied' };
  } catch (error) {
    threw = error;
    throw error;
  } finally {
    const cancelled = signal.aborted;
    // cancel/success wipe everything; on failure keep the partial +
    // sidecar + inflight row so a retry resumes from the real byte count
    if (cancelled || !threw) {
      await removeInflight(stem);
      await Promise.all(temps.map(removeFile));
    }
    await Promise.allSettled([releaseCpuLock(), releaseWifiLock()]);
  }
}

export function resumeInflight(
  item: InflightItem,
  onState: (state: DownloadState) => void,
  signal: AbortSignal
): Promise<DownloadOutcome> {
  return runDownload({
    info: {
      ...item.info,
      formats: [],
      type: 'video',
      id: item.id,
      webpageUrl: '',
      isJsInfo: false,
      fromBrain: false,
      isPartial: false,
      isIsrcMatch: false,
      isFullData: false,
    },
    format: item.format,
    stem: item.id,
    tag: item.tag,
    signal,
    onState,
    seed: item,
  });
}

export async function discardInflight(id: string): Promise<void> {
  await removeInflight(id);
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && entry.name.startsWith(`${id}.`)) {
        entry.delete();
      }
    }
  } catch {
    /* best-effort sweep of orphaned partials */
  }
}
