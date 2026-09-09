import { describe, it, expect } from 'vitest';
import {
  isMp4CopySafeVideoCodec,
  isMp4CopySafeAudioCodec,
  shouldVetoCopyMux,
  UnsupportedMuxCodecError,
} from '../src/lib/mux-codecs';

describe('mux-codecs: mp4 copy-safety predicates', () => {
  it('treats avc/hevc/vp9/av1 video as copy-safe (android/chromium target)', () => {
    expect(isMp4CopySafeVideoCodec('avc')).toBe(true);
    expect(isMp4CopySafeVideoCodec('hevc')).toBe(true);
    expect(isMp4CopySafeVideoCodec('vp9')).toBe(true);
    expect(isMp4CopySafeVideoCodec('av1')).toBe(true);
  });

  it('vetoes vp8 video (genuinely broken inside mp4)', () => {
    expect(isMp4CopySafeVideoCodec('vp8')).toBe(false);
  });

  it('treats aac/mp3/opus/flac audio as copy-safe; vetoes vorbis', () => {
    expect(isMp4CopySafeAudioCodec('aac')).toBe(true);
    expect(isMp4CopySafeAudioCodec('mp3')).toBe(true);
    expect(isMp4CopySafeAudioCodec('opus')).toBe(true);
    expect(isMp4CopySafeAudioCodec('flac')).toBe(true);
    expect(isMp4CopySafeAudioCodec('vorbis')).toBe(false);
  });

  it('treats null/undefined codecs as not-safe', () => {
    expect(isMp4CopySafeVideoCodec(null)).toBe(false);
    expect(isMp4CopySafeVideoCodec()).toBe(false);
    expect(isMp4CopySafeAudioCodec(null)).toBe(false);
  });
});

describe('mux-codecs: shouldVetoCopyMux', () => {
  it('allows the 4K youtube case (vp9 video + aac audio)', () => {
    expect(shouldVetoCopyMux('vp9', 'aac').veto).toBe(false);
    expect(shouldVetoCopyMux('av1', 'opus').veto).toBe(false);
    expect(shouldVetoCopyMux('avc', 'aac').veto).toBe(false);
    expect(shouldVetoCopyMux('hevc', 'aac').veto).toBe(false);
  });

  it('vetoes vp8 video with a video reason', () => {
    const v = shouldVetoCopyMux('vp8', 'aac');
    expect(v.veto).toBe(true);
    expect(v.reason).toBe('video_codec_vp8');
  });

  it('vetoes vorbis audio with an audio reason even when video is fine', () => {
    const v = shouldVetoCopyMux('vp9', 'vorbis');
    expect(v.veto).toBe(true);
    expect(v.reason).toBe('audio_codec_vorbis');
  });

  it('does NOT veto on unknown/null codecs (left to the main mux flow)', () => {
    expect(shouldVetoCopyMux(null, null).veto).toBe(false);
    expect(shouldVetoCopyMux(undefined, 'aac').veto).toBe(false);
    expect(shouldVetoCopyMux('vp9', null).veto).toBe(false);
  });
});

describe('mux-codecs: UnsupportedMuxCodecError', () => {
  it('is an Error tagged with a stable name (so callers can match without import)', () => {
    const e = new UnsupportedMuxCodecError('nope');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('UnsupportedMuxCodecError');
    expect(e.message).toBe('nope');
  });
});
