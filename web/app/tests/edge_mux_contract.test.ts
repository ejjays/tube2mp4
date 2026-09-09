import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/muxer', () => ({
  muxToMp4: vi.fn(),
  isClientMuxSupported: vi.fn(() => true),
}));
vi.mock('../src/lib/previewStream', () => ({
  resolveStreamUrls: vi.fn(),
}));
vi.mock('../src/store/useAppStore', () => ({
  useAppStore: {
    getState: () => ({
      sessionStartTime: 0,
      setEmePhase: () => {},
      setEmeProgress: () => {},
      setEmeBytes: () => {},
    }),
  },
}));

import { OrchestratorService } from '../src/lib/orchestrator.service';
import { muxToMp4, isClientMuxSupported } from '../src/lib/muxer';
import { resolveStreamUrls } from '../src/lib/previewStream';
import { getEmeStats } from '../src/lib/emeTelemetry';

const mockedMux = vi.mocked(muxToMp4);
const mockedSupported = vi.mocked(isClientMuxSupported);
const mockedResolve = vi.mocked(resolveStreamUrls);

const baseParams = {
  url: 'https://www.instagram.com/reel/ABC/',
  clientId: 'client-1',
  formatId: '1080p',
  targetUrl: '',
  selectedFormat: 'mp4',
  finalTitle: 'My Reel',
  artist: 'creator',
  backendUrl: 'http://localhost:5000',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedSupported.mockReturnValue(true);
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();
  // prevent cross-test telemetry pollution
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('OrchestratorService.startEdgeMuxing — contract', () => {
  it('engages client mux when stream-urls returns video + audio', async () => {
    mockedResolve.mockResolvedValue({
      videoUrl: 'https://cdn.example/v.mp4',
      audioUrl: 'https://cdn.example/a.m4a',
    });
    mockedMux.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }));

    const onComplete = vi.fn();
    const service = new OrchestratorService({ onComplete });
    const result = await service.startEdgeMuxing(baseParams);

    expect(result).toBe(true);
    expect(mockedMux).toHaveBeenCalledTimes(1);
    expect(mockedMux).toHaveBeenCalledWith(
      expect.objectContaining({
        videoUrl: 'https://cdn.example/v.mp4',
        audioUrl: 'https://cdn.example/a.m4a',
        metadata: { title: 'My Reel', artist: 'creator' },
      })
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('bails to fallback when audioUrl is missing (single muxed stream)', async () => {
    mockedResolve.mockResolvedValue({
      videoUrl: 'https://cdn.example/v.mp4',
      directUrl: 'https://cdn.example/v.mp4',
    });

    const service = new OrchestratorService();
    const result = await service.startEdgeMuxing(baseParams);

    expect(result).toBe(false);
    expect(mockedMux).not.toHaveBeenCalled();
  });

  it('does not run for non-mp4 (audio) formats', async () => {
    const service = new OrchestratorService();
    const result = await service.startEdgeMuxing({
      ...baseParams,
      selectedFormat: 'mp3',
    });

    expect(result).toBe(false);
    expect(mockedResolve).not.toHaveBeenCalled();
    expect(mockedMux).not.toHaveBeenCalled();
  });

  it('falls back to false when muxing throws', async () => {
    mockedResolve.mockResolvedValue({
      videoUrl: 'https://cdn.example/v.mp4',
      audioUrl: 'https://cdn.example/a.m4a',
    });
    mockedMux.mockRejectedValue(new Error('decode failed'));

    const onComplete = vi.fn();
    const service = new OrchestratorService({ onComplete });
    const result = await service.startEdgeMuxing(baseParams);

    expect(result).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    expect(getEmeStats().failures).toBe(1);
    expect(getEmeStats().skips).toBe(0);
  });

  it('records a skip (not a failure) when the muxer vetoes the source codec', async () => {
    mockedResolve.mockResolvedValue({
      videoUrl: 'https://cdn.example/v.webm',
      audioUrl: 'https://cdn.example/a.webm',
    });
    mockedMux.mockRejectedValue(
      Object.assign(
        new Error('Source codecs not copy-safe for mp4 (video_codec_vp8)'),
        { name: 'UnsupportedMuxCodecError' }
      )
    );

    const onComplete = vi.fn();
    const service = new OrchestratorService({ onComplete });
    const result = await service.startEdgeMuxing(baseParams);

    expect(result).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    expect(getEmeStats().skips).toBe(1);
    expect(getEmeStats().failures).toBe(0);
  });

  it('treats a user cancel as a skip and never a failure', async () => {
    mockedResolve.mockResolvedValue({
      videoUrl: 'https://cdn.example/v.mp4',
      audioUrl: 'https://cdn.example/a.m4a',
    });

    const service = new OrchestratorService();
    mockedMux.mockImplementation(() => {
      service.cancel();
      return Promise.reject(
        Object.assign(new Error('Edge muxing aborted'), {
          name: 'AbortError',
        })
      );
    });

    const result = await service.startEdgeMuxing(baseParams);

    expect(result).toBe(false);
    expect(service.wasCancelled()).toBe(true);
    expect(getEmeStats().skips).toBe(1);
    expect(getEmeStats().failures).toBe(0);
  });
});
