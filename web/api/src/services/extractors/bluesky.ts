import { createBlueskyExtractor } from '@phantom/extractors';
import { Readable } from 'node:stream';
import { sharedBackendEnv } from './sharedEnv.js';
import type { Extractor, ExtractorOptions, VideoInfo } from '../../types/index.js';

const { getInfo, getStream } = createBlueskyExtractor(sharedBackendEnv);

export function bsGetInfo(
  url: string,
  options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  return getInfo(url, options);
}

export function bsGetStream(
  videoInfo: VideoInfo,
  options: ExtractorOptions = {}
): Promise<Readable> {
  return getStream(videoInfo, options).then(
    (stream) =>
      Readable.fromWeb(
        stream as unknown as import('node:stream/web').ReadableStream
      )
  );
}

export const bluesky: Extractor = { getInfo: bsGetInfo, getStream: bsGetStream };

export { bsGetInfo as getInfo, bsGetStream as getStream };