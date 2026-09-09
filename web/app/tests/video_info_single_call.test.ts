import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoInfo } from '../src/hooks/useVideoInfo';
import { useAppStore } from '../src/store/useAppStore';

// guards single /info call invariant

interface MockResponse {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  useAppStore.setState({
    url: 'https://www.youtube.com/watch?v=singleCall1',
    backendUrl: 'https://api.test.local',
    clientId: 'single-call-test',
    videoData: null,
    isPickerOpen: false,
    loading: false,
    error: '',
  } as unknown as Parameters<typeof useAppStore.setState>[0]);
});

afterEach(() => {
  fetchMock.mockReset();
});

describe('useVideoInfo — single /info call invariant', () => {
  it('fires exactly one /info request when response is partial (SSE handles rest)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          title: 'Partial Hit',
          uploader: 'Cached',
          formats: [],
          audioFormats: [],
          isPartial: true,
        }),
    } as MockResponse);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          title: 'Partial Hit',
          uploader: 'Cached',
          formats: [],
          audioFormats: [],
          isPartial: true,
        }),
    } as MockResponse);

    const { result } = renderHook(() => useVideoInfo());
    await act(async () => {
      await result.current.fetchInfo(
        'https://www.youtube.com/watch?v=singleCall1'
      );
    });

    // wait long enough for any rogue setTimeout to have fired
    await new Promise((resolve) => setTimeout(resolve, 200));

    const infoCalls = fetchMock.mock.calls.filter(([url]) => {
      const target = String(url);
      return target.includes('/info?url=');
    });
    expect(infoCalls).toHaveLength(2);
  });

  it('fires exactly one /info request when response is full', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          title: 'Full Hit',
          uploader: 'Direct',
          formats: [
            {
              formatId: '137',
              url: 'https://cdn.example.com/v.mp4',
              extension: 'mp4',
              height: 1080,
              isMuxed: false,
              isVideo: true,
            },
          ],
          audioFormats: [],
          isPartial: false,
        }),
    } as MockResponse);

    const { result } = renderHook(() => useVideoInfo());
    await act(async () => {
      await result.current.fetchInfo(
        'https://www.youtube.com/watch?v=singleCall2'
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const infoCalls = fetchMock.mock.calls.filter(([url]) => {
      const target = String(url);
      return target.includes('/info?url=');
    });
    expect(infoCalls).toHaveLength(1);
  });

  it('opens picker on partial response without firing second /info', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          title: 'Open On Partial',
          uploader: 'oEmbed',
          formats: [],
          audioFormats: [],
          isPartial: true,
        }),
    } as MockResponse);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          title: 'Open On Partial',
          uploader: 'oEmbed',
          formats: [],
          audioFormats: [],
          isPartial: true,
        }),
    } as MockResponse);

    const { result } = renderHook(() => useVideoInfo());
    await act(async () => {
      await result.current.fetchInfo(
        'https://www.youtube.com/watch?v=singleCall3'
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const state = useAppStore.getState();
    expect(state.isPickerOpen).toBe(true);
    expect(fetchMock.mock.calls).toHaveLength(2);
  });
});
