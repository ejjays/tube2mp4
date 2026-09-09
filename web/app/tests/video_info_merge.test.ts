import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVideoInfo } from '../src/hooks/useVideoInfo';
import { useAppStore } from '../src/store/useAppStore';

/**
 * Regression tests for useVideoInfo's response-merge logic.
 *
 * Same fuller-format-list rule as the SSE handler, but applied to the
 * /info HTTP response and the fallback hydration path. These tests
 * guarantee that:
 *   - A skinny HTTP response (Innertube limited subset) does NOT
 *     overwrite a prior richer state populated via SSE.
 *   - The fallback hydration branch behaves identically.
 *
 * We mock global.fetch to feed crafted /info responses and inspect the
 * resulting store state after fetchInfo() resolves.
 */

interface MockResponse {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
}

const fetchMock = vi.fn();

function queueResponses(...responses: unknown[]) {
  fetchMock.mockReset();
  for (const body of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => body,
    } as MockResponse);
  }
}

function makeFormat(height: number) {
  return {
    formatId: `id-${height}`,
    url: `https://cdn.example.com/${height}`,
    extension: 'mp4',
    resolution: `${height}p`,
    height,
    isMuxed: false,
    isVideo: true,
    isAudio: false,
  };
}

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  // Reset the Zustand store between tests so leaked state doesn't
  // bleed across cases.
  useAppStore.setState({
    url: 'https://www.youtube.com/watch?v=test',
    backendUrl: 'https://api.test.local',
    clientId: 'test-client',
    videoData: null,
    isPickerOpen: false,
    loading: false,
    error: '',
  } as unknown as Parameters<typeof useAppStore.setState>[0]);
});

afterEach(() => {
  fetchMock.mockReset();
});

describe('useVideoInfo — keeps fuller format list across HTTP merges', () => {
  it('REPLACES prev when the HTTP response has more formats', async () => {
    // Pre-seed videoData with 1 format (e.g. from an earlier limited SSE).
    useAppStore.setState({
      videoData: {
        title: 'Old',
        formats: [makeFormat(360)],
        audioFormats: [],
      },
    } as unknown as Parameters<typeof useAppStore.setState>[0]);

    queueResponses({
      title: 'New',
      formats: [makeFormat(360), makeFormat(720), makeFormat(1080)],
      audioFormats: [],
      isPartial: false,
      webpageUrl: 'https://www.youtube.com/watch?v=test',
    });

    const { result } = renderHook(() => useVideoInfo());

    await act(async () => {
      await result.current.fetchInfo('https://www.youtube.com/watch?v=test');
    });

    await waitFor(() => {
      const state = useAppStore.getState().videoData;
      expect(state?.formats).toBeDefined();
      expect(state?.formats?.length ?? 0).toBeGreaterThanOrEqual(3);
    });

    const merged = useAppStore.getState().videoData;
    expect(merged?.formats?.some((f) => f.height === 1080)).toBe(true);
    expect(merged?.title).toBe('New');
  });

  it('KEEPS prev formats when the HTTP response is leaner (regression case)', async () => {
    // Pre-seed videoData with the FULL set (e.g. yt-dlp enhancement
    // pushed 16 formats via SSE before the second /info HTTP arrived).
    const richFormats = [144, 240, 360, 480, 720, 1080, 1440, 2160].map(
      makeFormat
    );
    useAppStore.setState({
      videoData: {
        title: 'Rich Title',
        formats: richFormats,
        audioFormats: [makeFormat(0), makeFormat(0)],
        // Must match the URL passed to fetchInfo, otherwise the hook resets
        // videoData to null on URL mismatch.
        webpageUrl: 'https://www.youtube.com/watch?v=test',
      },
    } as unknown as Parameters<typeof useAppStore.setState>[0]);

    // The lean Innertube response that USED to clobber the rich state.
    queueResponses({
      title: 'Lean Title',
      formats: [makeFormat(360)],
      audioFormats: [],
      isPartial: false,
      webpageUrl: 'https://www.youtube.com/watch?v=test',
    });

    const { result } = renderHook(() => useVideoInfo());

    await act(async () => {
      await result.current.fetchInfo('https://www.youtube.com/watch?v=test');
    });

    const merged = useAppStore.getState().videoData;
    // Critical: the 8 rich formats survive the HTTP merge.
    expect(merged?.formats?.length).toBe(8);
    expect(merged?.formats?.some((f) => f.height === 2160)).toBe(true);
    // Non-format fields from the new response still propagate.
    expect(merged?.title).toBe('Lean Title');
  });
});
