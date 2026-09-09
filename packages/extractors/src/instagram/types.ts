export interface IgMedia {
  url: string;
  isVideo: boolean;
  width?: number;
  height?: number;
  muxAudioUrl?: string;
  muxAudioExt?: string;
  isMuxed?: boolean;
  formatId?: string;
  quality?: string;
}

export interface IgParsed {
  id: string | null;
  title: string;
  uploader: string;
  thumbnail?: string;
  media: IgMedia[];
}

export interface IgDashVideo {
  url: string;
  width: number;
  height: number;
}
