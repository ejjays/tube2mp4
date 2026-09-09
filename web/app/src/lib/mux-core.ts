// shared muxer for main/worker paths
import {
  type Input,
  Output,
  Mp4OutputFormat,
  type BufferTarget,
  type StreamTarget,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  type EncodedPacket,
} from 'mediabunny';
import { shouldVetoCopyMux, UnsupportedMuxCodecError } from './mux-codecs';

export interface MuxTags {
  title?: string;
  artist?: string;
  album?: string;
}

export interface CopyMuxParams {
  videoInput: Input;
  audioInput: Input;
  target: BufferTarget | StreamTarget;
  metadata?: MuxTags;
  durationHint?: number;
  signal?: AbortSignal;
  onProgress?: (pct: number, detail: string) => void;
}

// sync track timing for output
export async function pumpTrack(
  sink: EncodedPacketSink,
  firstPacket: EncodedPacket | null,
  offset: number,
  onPacket: (packet: EncodedPacket, first: boolean) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  let packet = firstPacket;
  let first = true;
  let lastYield = Date.now();
  while (packet) {
    if (signal?.aborted) throw new Error('Edge muxing aborted');
    const shifted =
      offset > 0
        ? packet.clone({ timestamp: packet.timestamp + offset })
        : packet;
    await onPacket(shifted, first);
    first = false;
    packet = await sink.getNextPacket(packet);
    if (Date.now() - lastYield > 50) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastYield = Date.now();
    }
  }
}

// fast remux to fragmented MP4
export async function copyMuxTracks(params: CopyMuxParams): Promise<void> {
  const {
    videoInput,
    audioInput,
    target,
    metadata,
    durationHint,
    signal,
    onProgress,
  } = params;

  const videoTrack = await videoInput.getPrimaryVideoTrack();
  const audioTrack = await audioInput.getPrimaryAudioTrack();
  if (!videoTrack) throw new Error('No video track in source');
  if (!audioTrack) throw new Error('No audio track in source');

  const videoCodec = await videoTrack.getCodec();
  const audioCodec = await audioTrack.getCodec();
  if (!videoCodec || !audioCodec) throw new Error('Unsupported source codec');

  // avoid incompatible client-side muxing
  const verdict = shouldVetoCopyMux(videoCodec, audioCodec);
  if (verdict.veto) {
    throw new UnsupportedMuxCodecError(
      `Source codecs not copy-safe for mp4 (${verdict.reason})`
    );
  }

  const videoConfig = await videoTrack.getDecoderConfig();
  const audioConfig = await audioTrack.getDecoderConfig();
  if (!videoConfig || !audioConfig) throw new Error('Missing decoder config');

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented' }),
    target,
  });
  const videoSource = new EncodedVideoPacketSource(videoCodec);
  const audioSource = new EncodedAudioPacketSource(audioCodec);
  output.addVideoTrack(videoSource);
  output.addAudioTrack(audioSource);

  const tags: MuxTags = {};
  if (metadata?.title) tags.title = metadata.title;
  if (metadata?.artist) tags.artist = metadata.artist;
  if (metadata?.album) tags.album = metadata.album;
  if (Object.keys(tags).length > 0) output.setMetadataTags(tags);

  await output.start();

  const duration =
    durationHint && durationHint > 0
      ? durationHint
      : await videoInput.computeDuration().catch(() => 0);

  // bootstrap decoder on initial packet
  const videoMeta = { decoderConfig: videoConfig } as Parameters<
    EncodedVideoPacketSource['add']
  >[1];
  const audioMeta = { decoderConfig: audioConfig } as Parameters<
    EncodedAudioPacketSource['add']
  >[1];

  const videoSink = new EncodedPacketSink(videoTrack);
  const audioSink = new EncodedPacketSink(audioTrack);
  const videoFirst = await videoSink.getFirstPacket();
  const audioFirst = await audioSink.getFirstPacket();
  // normalize start time for MP4
  const minTs = Math.min(
    videoFirst?.timestamp ?? 0,
    audioFirst?.timestamp ?? 0,
    0
  );
  const offset = minTs < 0 ? -minTs : 0;

  let lastMuxPct = -1;
  let videoTs = 0;
  let audioTs = 0;
  // track the slower stream; audio outlasts video
  const reportMux = () => {
    if (!onProgress || duration <= 0) return;
    const ratio = Math.min(1, Math.min(videoTs, audioTs) / duration);
    const pct = 90 + Math.floor(ratio * 10);
    if (pct !== lastMuxPct) {
      lastMuxPct = pct;
      onProgress(pct, `Muxing ${pct}%`);
    }
  };
  await Promise.all([
    pumpTrack(
      videoSink,
      videoFirst,
      offset,
      async (packet, first) => {
        await videoSource.add(packet, first ? videoMeta : undefined);
        videoTs = packet.timestamp;
        reportMux();
      },
      signal
    ),
    pumpTrack(
      audioSink,
      audioFirst,
      offset,
      async (packet, first) => {
        await audioSource.add(packet, first ? audioMeta : undefined);
        audioTs = packet.timestamp;
        reportMux();
      },
      signal
    ),
  ]);

  await output.finalize();
}
