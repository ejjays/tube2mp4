import { Readable } from 'node:stream';
import { createBilibiliExtractor } from '@phantom/extractors';
import { sharedBackendEnv } from './sharedEnv.js';
import type { Extractor, ExtractorOptions, VideoInfo } from '../../types/index.js';

const biExtractor = createBilibiliExtractor(sharedBackendEnv);

export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo | null> {
  try {
    return (await biExtractor.getInfo(url, options as unknown as Parameters<typeof biExtractor.getInfo>[1])) as VideoInfo | null;
  } catch {
    return null;
  }
}

export function getStream(videoInfo: VideoInfo, options: ExtractorOptions = {}): Promise<Readable> {
  return biExtractor
    .getStream(
      videoInfo as unknown as Parameters<typeof biExtractor.getStream>[0],
      options as unknown as Parameters<typeof biExtractor.getStream>[1]
    )
    .then((stream) =>
      Readable.fromWeb(stream as unknown as import('node:stream/web').ReadableStream)
    );
}

export const bilibili: Extractor = {
  getInfo: getInfo as unknown as Extractor['getInfo'],
  getStream: getStream as unknown as Extractor['getStream'],
};
