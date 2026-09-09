import { Readable } from 'node:stream';
import { createSoundCloudExtractor } from '@phantom/extractors';
import { sharedBackendEnv } from './sharedEnv.js';
import type { Extractor, ExtractorOptions, VideoInfo } from '../../types/index.js';

const scExtractor = createSoundCloudExtractor(sharedBackendEnv);

export function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo | null> {
  return scExtractor.getInfo(url, options as unknown as Parameters<typeof scExtractor.getInfo>[1]) as Promise<VideoInfo | null>;
}

export function getStream(videoInfo: VideoInfo, options: ExtractorOptions = {}): Promise<Readable> {
  return scExtractor
    .getStream(
      videoInfo as unknown as Parameters<typeof scExtractor.getStream>[0],
      options as unknown as Parameters<typeof scExtractor.getStream>[1]
    )
    .then((stream) =>
      Readable.fromWeb(stream as unknown as import('node:stream/web').ReadableStream)
    );
}

export function search(query: string): Promise<unknown[]> {
  return scExtractor.search(query);
}

export const soundcloud: Extractor = {
  getInfo: getInfo as unknown as Extractor['getInfo'],
  getStream: getStream as unknown as Extractor['getStream'],
};
