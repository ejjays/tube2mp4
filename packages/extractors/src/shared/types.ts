export interface Format {
  formatId: string;
  url: string;
  extension: string;
  resolution?: string;
  quality?: string;
  width?: number;
  height?: number;
  tbr?: number;
  fps?: number | string;
  filesize?: number;
  vcodec?: string;
  acodec?: string;
  isMuxed: boolean;
  isVideo: boolean;
  isAudio: boolean;
  note?: string;
  isHls?: boolean;
  hlsAudioUrl?: string;
  hlsKeepAlive?: boolean;
  muxAudioUrl?: string;
  muxAudioExt?: string;
  noTranscode?: boolean;
  audioDemux?: boolean;
  abr?: number;
  itag?: number | string;
  audioUrl?: string;
}

export interface PlaylistEntry {
  id: string;
  title?: string;
  channel?: string;
  durationSec?: number;
  thumb?: string;
}

export interface VideoInfo {
  type: 'video';
  id: string;
  title: string;
  uploader: string;
  webpageUrl: string;
  thumbnail?: string;
  duration?: number;
  author?: string;
  description?: string;
  metascraper?: Record<string, unknown>;
  formats: Format[];
  audioFormats?: Format[];
  extractorKey?: string;
  isJsInfo: boolean;
  fromBrain: boolean;
  isPartial: boolean;
  isIsrcMatch: boolean;
  isFullData: boolean;
  downloadHeaders?: Record<string, string>;
  album?: string;
  source?: 'webview';
  previewUrl?: string | null;
  playlist?: {
    id: string;
    title: string;
    author?: string;
    authorAvatar?: string;
    entries: PlaylistEntry[];
  };
}

export class ExtractorError extends Error {
  readonly retryable: boolean;
  readonly expected: boolean;
  /**
   * The page loaded but the parser found no media. Distinct from "expected":
   * a private or removed video is also expected, but only this is evidence
   * our parser broke.
   */
  readonly emptyParse: boolean;
  constructor(
    message: string,
    retryable = true,
    expected = false,
    emptyParse = false
  ) {
    super(message);
    this.name = 'ExtractorError';
    this.retryable = retryable;
    this.expected = expected;
    this.emptyParse = emptyParse;
  }
}

export interface ExtractorOptions {
  formatId?: string;
  downloadHeaders?: Record<string, string>;
  isAudioMuxed?: boolean;
  format?: string;
  type?: string;
  cookie?: string;
  onPartial?: (info: VideoInfo) => void;
}

export interface Extractor {
  getInfo(url: string, options?: ExtractorOptions): Promise<VideoInfo | null>;
  getStream(
    videoInfo: VideoInfo,
    options?: ExtractorOptions
  ): Promise<ReadableStream>;
}
