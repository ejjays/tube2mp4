import { describe, it, expect } from 'vitest';
import { resolveFormatDetails } from '../../src/services/video/stream-resolver.js';
import type { Format, VideoInfo } from '../../src/types/index.js';

const makeFormat = (over: Partial<Format>): Format => ({
  formatId: 'base',
  url: 'https://cdn.example/base.mp4',
  extension: 'mp4',
  vcodec: 'none',
  acodec: 'none',
  isMuxed: false,
  isVideo: false,
  isAudio: false,
  ...over,
});

const makeInfo = (formats: Format[]): VideoInfo =>
  ({ formats }) as unknown as VideoInfo;

describe('resolveFormatDetails — audioUrl pairing for dash sources', () => {
  it('synthesizes a separate audio format from a video format audioUrl', () => {
    const info = makeInfo([
      makeFormat({
        formatId: '1080p',
        url: 'https://scontent.cdninstagram.com/v/1080.mp4',
        vcodec: 'h264',
        acodec: 'aac',
        audioUrl: 'https://scontent.cdninstagram.com/a/audio.mp4',
        isVideo: true,
        height: 1920,
      }),
    ]);

    const res = resolveFormatDetails(info, '1080p', false);

    expect(res.isAudioOnly).toBe(false);
    expect(res.finalVideoFormat?.formatId).toBe('1080p');
    expect(res.finalAudioFormat?.url).toBe(
      'https://scontent.cdninstagram.com/a/audio.mp4'
    );
    expect(res.finalAudioFormat?.vcodec).toBe('none');
  });

  it('does not synthesize audio for a muxed progressive format', () => {
    const info = makeInfo([
      makeFormat({
        formatId: 'sd',
        url: 'https://scontent.cdninstagram.com/v/sd.mp4',
        vcodec: 'h264',
        acodec: 'aac',
        isMuxed: true,
        isVideo: true,
        isAudio: true,
        height: 640,
      }),
    ]);

    const res = resolveFormatDetails(info, 'sd', false);
    expect(res.finalAudioFormat).toBeNull();
  });

  it('still selects a separate audio format for video-only sources', () => {
    const info = makeInfo([
      makeFormat({
        formatId: 'v1080',
        url: 'https://cdn.example/v/1080.mp4',
        vcodec: 'avc1.640028',
        acodec: 'none',
        isVideo: true,
        height: 1080,
      }),
      makeFormat({
        formatId: 'a140',
        url: 'https://cdn.example/a/audio.m4a',
        extension: 'm4a',
        vcodec: 'none',
        acodec: 'mp4a.40.2',
        isAudio: true,
        abr: 128,
      }),
    ]);

    const res = resolveFormatDetails(info, 'v1080', false);
    expect(res.finalAudioFormat?.formatId).toBe('a140');
  });

  it('picks audio-only from audioFormats for dash video-only', () => {
    const info = {
      formats: [
        makeFormat({
          formatId: '315',
          url: 'https://cdn.example/v/2160.webm',
          vcodec: 'vp9',
          acodec: 'none',
          isVideo: true,
          height: 2160,
        }),
        makeFormat({
          formatId: '18',
          url: 'https://cdn.example/v/muxed360.mp4',
          vcodec: 'avc1.42001E',
          acodec: 'mp4a.40.2',
          isMuxed: true,
          isVideo: true,
          isAudio: true,
          height: 360,
        }),
      ],
      audioFormats: [
        makeFormat({
          formatId: '251',
          url: 'https://cdn.example/a/opus.webm',
          extension: 'webm',
          vcodec: 'none',
          acodec: 'opus',
          isAudio: true,
          abr: 160,
        }),
      ],
    } as unknown as VideoInfo;

    const res = resolveFormatDetails(info, '315', false);
    expect(res.finalVideoFormat?.formatId).toBe('315');
    expect(res.finalAudioFormat?.formatId).toBe('251');
    expect(res.finalAudioFormat?.vcodec).toBe('none');
  });
});
