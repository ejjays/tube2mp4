/**
 * define codec safety for mp4 copy-mux.
 * allows modern formats (vp9/av1) in mp4 for android/chromium.
 * vetoes broken combos like vp8/vorbis and routes to server.
 * no external imports for easy testing.
 */

const MP4_UNSAFE_VIDEO_CODECS = new Set(['vp8']);
const MP4_UNSAFE_AUDIO_CODECS = new Set(['vorbis']);

export function isMp4CopySafeVideoCodec(codec?: string | null): boolean {
  if (!codec) return false;
  return !MP4_UNSAFE_VIDEO_CODECS.has(codec);
}

export function isMp4CopySafeAudioCodec(codec?: string | null): boolean {
  if (!codec) return false;
  return !MP4_UNSAFE_AUDIO_CODECS.has(codec);
}

export interface CopyMuxVeto {
  veto: boolean;
  reason?: string;
}

/**
 * determine if codec combo requires server transcoding.
 * only vetoes known-broken codecs; others pass to validation.
 */
export function shouldVetoCopyMux(
  videoCodec: string | null | undefined,
  audioCodec: string | null | undefined
): CopyMuxVeto {
  if (videoCodec && !isMp4CopySafeVideoCodec(videoCodec)) {
    return { veto: true, reason: `video_codec_${videoCodec}` };
  }
  if (audioCodec && !isMp4CopySafeAudioCodec(audioCodec)) {
    return { veto: true, reason: `audio_codec_${audioCodec}` };
  }
  return { veto: false };
}

/**
 * signals codec incompatibility for client-side mux.
 * orchestrator handles this as a skip to server.
 */
export class UnsupportedMuxCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedMuxCodecError';
  }
}
