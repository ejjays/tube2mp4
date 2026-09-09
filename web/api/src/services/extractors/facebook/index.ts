import { Readable } from 'node:stream';
import { createFacebookExtractor } from '@phantom/extractors';
import { sharedBackendEnv } from '../sharedEnv.js';
import type { Extractor, ExtractorOptions, VideoInfo } from '../../../types/index.js';

const fbExtractor = createFacebookExtractor(sharedBackendEnv);

export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo | null> {
  try {
    return (await fbExtractor.getInfo(url, options as unknown as Parameters<typeof fbExtractor.getInfo>[1])) as VideoInfo | null;
  } catch {
    return null;
  }
}

export function getStream(videoInfo: VideoInfo, options: ExtractorOptions = {}): Promise<Readable> {
  return fbExtractor
    .getStream(
      videoInfo as unknown as Parameters<typeof fbExtractor.getStream>[0],
      options as unknown as Parameters<typeof fbExtractor.getStream>[1]
    )
    .then((stream) =>
      Readable.fromWeb(stream as unknown as import('node:stream/web').ReadableStream)
    );
}

export const facebook: Extractor = {
  getInfo: getInfo as unknown as Extractor['getInfo'],
  getStream: getStream as unknown as Extractor['getStream'],
};
