import { describe, it, expect } from 'vitest';
import {
  FinalResponseSchema,
  SpotifyMetadataSchema,
  VideoInfoSchema,
  FormatSchema,
} from '@phantom/shared/schemas/media.schema';

describe('Media Contract Hardening', () => {
  describe('FormatSchema', () => {
    it('should validate a valid format', () => {
      const validFormat = {
        formatId: '137',
        url: 'https://example.com/video.mp4',
        extension: 'mp4',
        isVideo: true,
        height: 1080,
      };
      const result = FormatSchema.parse(validFormat);
      expect(result.isVideo).toBe(true);
      expect(result.isAudio).toBe(false); // default
      expect(result.isMuxed).toBe(false); // default
    });

    it('should fail on invalid URL', () => {
      const invalidFormat = {
        formatId: '137',
        url: 'not-a-url',
        extension: 'mp4',
      };
      expect(() => FormatSchema.parse(invalidFormat)).toThrow();
    });
  });

  describe('SpotifyMetadataSchema', () => {
    it('should validate valid spotify metadata', () => {
      const validSpotify = {
        id: 'track123',
        title: 'Song Title',
        artist: 'Artist Name',
        type: 'spotify',
        cover: 'https://scdn.co/img.jpg',
        duration: 180,
      };
      const result = SpotifyMetadataSchema.parse(validSpotify);
      expect(result.type).toBe('spotify');
      expect(result.fromBrain).toBe(false); // default
    });

    it('should fail if artist is missing', () => {
      const invalidSpotify = {
        id: 'track123',
        title: 'Song Title',
        type: 'spotify',
      };
      expect(() => SpotifyMetadataSchema.parse(invalidSpotify)).toThrow(
        /Artist is required/
      );
    });
  });

  describe('VideoInfoSchema', () => {
    it('should validate valid video info', () => {
      const validVideo = {
        id: 'vid123',
        title: 'Video Title',
        uploader: 'Channel Name',
        webpageUrl: 'https://youtube.com/watch?v=123',
        type: 'video',
        thumbnail: 'https://ytimg.com/img.jpg',
      };
      const result = VideoInfoSchema.parse(validVideo);
      expect(result.type).toBe('video');
      expect(result.formats).toEqual([]); // default
    });
  });

  describe('FinalResponseSchema', () => {
    it('should validate a complete final response', () => {
      const payload = {
        id: '123',
        title: 'Cool Song',
        artist: 'Nice Artist',
        uploader: 'Nice Artist',
        album: 'Best Album',
        cover: 'https://example.com/cover.jpg',
        thumbnail: '/logo.webp', // local fallback
        formats: [],
        audioFormats: [],
        webpageUrl: 'https://example.com/video',
        isPartial: false,
        isIsrcMatch: true,
      };
      const result = FinalResponseSchema.parse(payload);
      expect(result.id).toBe('123');
      expect(result.thumbnail).toBe('/logo.webp');
      expect(result.isPartial).toBe(false);
    });

    it('should handle data URIs for images', () => {
      const payload = {
        id: '123',
        title: 'Cool Song',
        artist: 'Nice Artist',
        uploader: 'Nice Artist',
        cover:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        thumbnail: 'https://example.com/thumb.jpg',
        formats: [],
        audioFormats: [],
        webpageUrl: 'https://example.com/video',
      };
      const result = FinalResponseSchema.parse(payload);
      expect(result.cover).toMatch(/^data:image\/png/);
    });

    it('should fail on missing required fields', () => {
      const invalidPayload = {
        id: '123',
        // title missing
        artist: 'Artist',
      };
      expect(() => FinalResponseSchema.parse(invalidPayload)).toThrow();
    });
  });
});
