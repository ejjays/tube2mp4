import { createVimeoExtractor } from '@phantom/extractors';
import { Readable } from 'node:stream';
import { sharedBackendEnv } from './sharedEnv.js';
import type { Extractor, ExtractorOptions, VideoInfo } from '../../types/index.js';

const { getInfo, getStream } = createVimeoExtractor(sharedBackendEnv);

export function vmGetInfo(
  url: string,
  options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  return getInfo(url, options);
}

export function vmGetStream(
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

export const vimeo: Extractor = { getInfo: vmGetInfo, getStream: vmGetStream };

export { vmGetInfo as getInfo, vmGetStream as getStream };