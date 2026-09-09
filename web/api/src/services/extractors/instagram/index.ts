import { Readable } from 'node:stream';
import { createInstagramExtractor } from '@phantom/extractors';
import { sharedBackendEnv } from '../sharedEnv.js';
import type { Extractor, ExtractorOptions, VideoInfo } from '../../../types/index.js';

const igExtractor = createInstagramExtractor({
  ...sharedBackendEnv,
  get cookie() {
    return process.env.IG_COOKIE?.trim() || undefined;
  },
});

export async function getInfo(
  url: string,
  options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  try {
    return (await igExtractor.getInfo(
      url,
      options as unknown as Parameters<typeof igExtractor.getInfo>[1]
    )) as VideoInfo | null;
  } catch {
    return null;
  }
}

export function getStream(
  videoInfo: VideoInfo,
  options: ExtractorOptions = {}
): Promise<Readable> {
  return igExtractor
    .getStream(
      videoInfo as unknown as Parameters<typeof igExtractor.getStream>[0],
      options as unknown as Parameters<typeof igExtractor.getStream>[1]
    )
    .then(
      (stream) =>
        Readable.fromWeb(
          stream as unknown as import('node:stream/web').ReadableStream
        )
    );
}

export const instagram: Extractor = {
  getInfo: getInfo as unknown as Extractor['getInfo'],
  getStream: getStream as unknown as Extractor['getStream'],
};
