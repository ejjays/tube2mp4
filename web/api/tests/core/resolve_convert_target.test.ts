import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/ytdlp.service.js', () => ({
  getVideoInfo: vi.fn(),
}));

import { resolveConvertTarget } from '../../src/utils/api/controller.util.js';
import { getVideoInfo } from '../../src/services/ytdlp.service.js';
import type { VideoInfo } from '../../src/types/index.js';

const asInfo = (partial: Partial<VideoInfo>) => partial as VideoInfo;
const SPOTIFY = 'https://open.spotify.com/track/x';

describe('resolveConvertTarget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a youtube targetURL directly', async () => {
    const out = await resolveConvertTarget(
      SPOTIFY,
      'https://youtube.com/watch?v=abc',
      []
    );
    expect(out).toBe('https://youtube.com/watch?v=abc');
  });

  it('falls back to videoURL when targetURL is not allowed', async () => {
    const out = await resolveConvertTarget(
      SPOTIFY,
      'https://evil.example/x',
      []
    );
    expect(out).toBe(SPOTIFY);
  });

  it('resolves a spotify url to its resolved targetUrl', async () => {
    vi.mocked(getVideoInfo).mockResolvedValue(
      asInfo({ isPartial: false, targetUrl: 'https://youtube.com/watch?v=zzz' })
    );
    const out = await resolveConvertTarget(SPOTIFY, undefined, []);
    expect(out).toBe('https://youtube.com/watch?v=zzz');
  });

  it('falls back to videoURL when no targetUrl resolves', async () => {
    vi.mocked(getVideoInfo).mockResolvedValue(asInfo({ isPartial: false }));
    const out = await resolveConvertTarget(SPOTIFY, undefined, []);
    expect(out).toBe(SPOTIFY);
  });
});
