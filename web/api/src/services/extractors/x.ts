import { createXExtractor } from '@phantom/extractors';
import { Readable } from 'node:stream';
import { sharedBackendEnv } from './sharedEnv.js';
import type { Extractor, ExtractorOptions, VideoInfo } from '../../types/index.js';

const { getInfo, getStream } = createXExtractor(sharedBackendEnv);

export function xGetInfo(
  url: string,
  options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  return getInfo(url, options);
}

export function xGetStream(
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

export const x: Extractor = { getInfo: xGetInfo, getStream: xGetStream };

export { xGetInfo as getInfo, xGetStream as getStream };