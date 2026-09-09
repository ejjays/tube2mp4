import { Readable } from 'node:stream';
import {
  VideoInfo as SharedVideoInfo,
  Format as SharedFormat,
  SpotifyMetadata as SharedSpotifyMetadata,
  FinalResponse as SharedFinalResponse,
  AudioFeatures as SharedAudioFeatures,
} from '@phantom/shared/schemas/media.schema';

export type Format = SharedFormat;
export type VideoInfo = SharedVideoInfo;
export type SpotifyMetadata = SharedSpotifyMetadata;
export type FinalResponse = SharedFinalResponse;
export type AudioFeatures = SharedAudioFeatures;

export interface SSEEvent {
  status:
    | 'initializing'
    | 'seeding'
    | 'extracting'
    | 'processing'
    | 'success'
    | 'error'
    | 'downloading'
    | 'finished';
  progress?: number;
  subStatus?: string;
  details?: string;
  text?: string;
  message?: string;
  metadata_update?: Partial<VideoInfo>;
}

export interface ExtractorOptions {
  cookie?: string;
  cookie_name?: string;
  formatId?: string;
  format?: string;
  onProgress?: (
    status: string,
    progress: number,
    subStatus?: string,
    details?: string
  ) => void;
  signal?: AbortSignal;
  // measure end-to-end request latency
  requestT0?: number;
}

export interface Extractor {
  getInfo: (
    url: string,
    options?: ExtractorOptions
  ) => Promise<VideoInfo | null>;
  getStream: (
    videoInfo: VideoInfo,
    options?: ExtractorOptions
  ) => Promise<Readable>;
}

export interface TursoResult<T = unknown> {
  rows: T[];
}

export interface TursoStatement {
  sql: string;
  args?: (string | number | null)[];
}
