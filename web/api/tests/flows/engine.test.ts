import { describe, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { createMockChildProcess } from '../utils/mocks.js';

// mock spawn
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

// mock spotify
vi.mock('../../src/services/spotify/metadata.js', () => ({
  fetchInitialMetadata: vi.fn().mockImplementation((url) => {
    return Promise.resolve({
      metadata: {
        id: 'sp_123',
        title: url.includes('2zo9LbUgr')
          ? 'Pag-ibig Na Kay Ganda'
          : 'Big Buck Bunny',
        artist: 'Spring Worship',
        isrc: 'PHB362300001',
        imageUrl: 'https://example.com/cover.jpg',
        duration: 338000,
      },
    });
  }),
  resolveSideTasks: vi.fn().mockResolvedValue({}),
  fetchPreviewUrlManually: vi
    .fn()
    .mockResolvedValue('https://example.com/preview.mp3'),
}));

// mock extractors
vi.mock('../../src/services/extractors/index.js', () => {
  return {
    getInfo: vi.fn().mockImplementation((url: string) => {
      const isSpotify =
        /\bspotify\.com\b/u.test(url) || /\b2zo9LbUgr\b/u.test(url);
      return Promise.resolve({
        id: isSpotify ? 'sp_123' : 'yt_123',
        title: isSpotify ? 'Pag-ibig Na Kay Ganda' : 'Big Buck Bunny',
        artist: isSpotify ? 'Spring Worship' : 'Blender',
        uploader: isSpotify ? 'Spring Worship' : 'Blender',
        album: 'Test Album',
        formats: [
          {
            formatId: isSpotify ? 'audio_1' : 'video_1',
            url: 'https://example.com/mock.mp4',
            ext: isSpotify ? 'm4a' : 'mp4',
            vcodec: isSpotify ? 'none' : 'h264',
            acodec: isSpotify ? 'aac' : 'yes',
            isAudio: isSpotify,
            isVideo: !isSpotify,
          },
        ],
        webpageUrl: url,
        isrc: isSpotify ? 'PHB362300001' : undefined,
        spotifyMetadata: isSpotify
          ? {
              id: 'sp_123',
              title: 'Pag-ibig Na Kay Ganda',
              artist: 'Spring Worship',
              album: 'Test Album',
            }
          : undefined,
      });
    }),
    getExtractor: vi.fn(),
    shouldJSStream: vi.fn().mockReturnValue(true),
  };
});

// deps
import { getVideoInfo } from '../../src/services/ytdlp.service.js';
import rawCases from '../fixtures/sites.json';
import { CaseSchema } from '../utils/schema.js';
import { assertOutcome } from '../utils/assert.js';

// load cases
const testCases = z.array(CaseSchema).parse(rawCases);

describe('engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(testCases)('verify $name', async ({ url, expected }) => {
    const startTime = performance.now();

    const mockMetadata = {
      id: 'test_123',
      title: expected.title || 'test',
      artist: 'Spring Worship',
      uploader: 'Spring Worship',
      album: 'Test Album',
      webpageUrl: url,
      duration: 120,
      isrc: expected.mustHaveIsrc ? 'PHB362300001' : undefined,
      formats: [
        {
          formatId: '137',
          url: 'https://example.com/mock.mp4',
          ext: expected.type === 'audio' ? 'm4a' : 'mp4',
          vcodec: expected.type === 'video' ? 'h264' : 'none',
          acodec: expected.type === 'audio' ? 'aac' : 'none',
          isAudio: expected.type === 'audio',
          isVideo: expected.type === 'video',
        },
      ],
      thumbnail: 'https://example.com/thumb.jpg',
    };

    const mockProcess = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess);

    setTimeout(() => {
      mockProcess.stdout?.emit('data', JSON.stringify(mockMetadata));
      mockProcess.emit('close', 0);
    }, 50);

    // wait for resolve
    let info = await getVideoInfo(url, [], false, null, 'test');
    if (info.isPartial) {
      await new Promise((res) => setTimeout(res, 100));
      info = await getVideoInfo(url, [], false, null, 'test');
    }

    const duration = performance.now() - startTime;

    // check result
    assertOutcome(info, expected);

    console.log(`[engine] ${expected.title} ok (${duration.toFixed(2)}ms)`);
  });
});
