import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { SNIFFER_JS } from '../src/lib/webviewExtraction/sniffer';

const { listeners } = vi.hoisted(() => ({
  listeners: [] as Array<(state: string) => void>,
}));

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_type: string, cb: (state: string) => void) => {
      listeners.push(cb);
      return { remove: () => undefined };
    },
  },
}));

import {
  attachGenericWebView,
  detachGenericWebView,
  extractFromPage,
  onWebViewFailed,
  onWebViewHttpError,
  onGenericWebViewMessage,
  onWebViewPageEnded,
  onWebViewRequest,
} from '../src/lib/webviewExtraction/host';

const scanMessage = (url: string) =>
  JSON.stringify({
    type: 'pageScan',
    data: {
      url,
      title: 't',
      videos: [{ url: `${url}/v.mp4`, width: 1280, height: 720 }],
      images: [],
    },
  });

const makeHandle = () => ({
  navigate: vi.fn(),
  injectJavaScript: vi.fn(),
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  detachGenericWebView();
  vi.useRealTimers();
});

describe('webview host', () => {
  it('resolves a direct media url through a metadata probe page', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://cdn.example/video.mp4');

    expect(handle.navigate).toHaveBeenCalledWith(
      expect.stringContaining('data:text/html')
    );
    onGenericWebViewMessage(
      JSON.stringify({
        type: 'pageScan',
        data: {
          url: 'data:text/html;charset=utf-8,probe',
          title: '',
          videos: [
            { url: 'https://cdn.example/video.mp4', width: 1280, height: 720 },
          ],
          images: [],
        },
      })
    );
    await expect(promise).resolves.toMatchObject({
      url: 'https://cdn.example/video.mp4',
      isDirect: true,
      videos: [{ url: 'https://cdn.example/video.mp4', height: 720 }],
    });
  });

  it('loads queued urls sequentially', () => {
    const handle = makeHandle();
    attachGenericWebView(handle);

    const first = extractFromPage('https://a.com');
    const second = extractFromPage('https://b.com');
    expect(handle.navigate).toHaveBeenCalledTimes(1);
    expect(handle.navigate).toHaveBeenCalledWith('https://a.com');

    onGenericWebViewMessage(scanMessage('https://a.com'));
    return expect(first)
      .resolves.toMatchObject({ url: 'https://a.com' })
      .then(() => {
        expect(handle.navigate).toHaveBeenLastCalledWith('https://b.com');
        onGenericWebViewMessage(scanMessage('https://b.com'));
        return expect(second).resolves.toMatchObject({ url: 'https://b.com' });
      });
  });

  it('streams partial scans via onScan', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);

    const onScan = vi.fn();
    const promise = extractFromPage('https://a.com', onScan);
    onGenericWebViewMessage(scanMessage('https://a.com'));
    await promise;

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan.mock.calls[0][0].videos).toHaveLength(1);
  });

it('injects the sniffer once per page url', () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    void extractFromPage('https://a.com');

    onWebViewPageEnded('https://a.com');
    onWebViewPageEnded('https://a.com');
    expect(handle.injectJavaScript).toHaveBeenCalledTimes(1);
    expect(handle.injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining(SNIFFER_JS)
    );
  });

  it('re-injects after navigating to a new page url', () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    void extractFromPage('https://a.com');

    onWebViewPageEnded('https://a.com');
    onWebViewPageEnded('https://a.com/redirected');
    expect(handle.injectJavaScript).toHaveBeenCalledTimes(2);
  });

  it('holds empty scans until videos arrive', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    let settled: 'pending' | 'done' = 'pending';
    const promise = extractFromPage('https://a.com');
    void promise.then(() => {
      settled = 'done';
    });

    onGenericWebViewMessage(
      JSON.stringify({
        type: 'pageScan',
        data: { url: 'https://a.com', title: 't', videos: [], images: [] },
      })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe('pending');

    onGenericWebViewMessage(scanMessage('https://a.com'));
    await expect(promise).resolves.toMatchObject({ url: 'https://a.com' });
  });

  it('settles null once scans stay idle past the patience floor', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');
    const empty = JSON.stringify({
      type: 'pageScan',
      data: { url: 'https://a.com', title: 't', videos: [], images: [] },
    });

    onGenericWebViewMessage(empty);
    onGenericWebViewMessage(empty);
    onGenericWebViewMessage(empty);
    vi.advanceTimersByTime(8_000);
    onGenericWebViewMessage(empty);
    await expect(promise).resolves.toBeNull();
  });

  it('holds empty scans until the patience floor even when idle', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    let settled: 'pending' | 'done' = 'pending';
    const promise = extractFromPage('https://a.com');
    void promise.then(() => {
      settled = 'done';
    });
    const empty = JSON.stringify({
      type: 'pageScan',
      data: { url: 'https://a.com', title: 't', videos: [], images: [] },
    });

    onGenericWebViewMessage(empty);
    onGenericWebViewMessage(empty);
    onGenericWebViewMessage(empty);
    vi.advanceTimersByTime(7_000);
    onGenericWebViewMessage(empty);
    expect(settled).toBe('pending');

    vi.advanceTimersByTime(2_000);
    onGenericWebViewMessage(empty);
    await expect(promise).resolves.toBeNull();
  });

  it('ignores stale scans from a previous injection', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    let settled: 'pending' | 'done' = 'pending';
    const promise = extractFromPage('https://a.com');
    void promise.then(() => {
      settled = 'done';
    });

    onGenericWebViewMessage(
      JSON.stringify({
        type: 'pageScan',
        id: 0,
        data: {
          url: 'https://stale.example',
          title: 't',
          videos: [{ url: 'https://stale.example/v.mp4' }],
          images: [],
        },
      })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe('pending');

    onGenericWebViewMessage(scanMessage('https://a.com'));
    await expect(promise).resolves.toMatchObject({
      url: 'https://a.com',
      title: 't',
      videos: [{ url: 'https://a.com/v.mp4' }],
    });
  });

  it('holds placeholder-only scans until a real video arrives', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    let settled: 'pending' | 'done' = 'pending';
    const promise = extractFromPage('https://a.com');
    void promise.then(() => {
      settled = 'done';
    });

    onGenericWebViewMessage(
      JSON.stringify({
        type: 'pageScan',
        data: {
          url: 'https://a.com',
          title: 't',
          videos: [{ url: 'https://a.com' }],
          images: [],
        },
      })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe('pending');

    onGenericWebViewMessage(scanMessage('https://a.com'));
    await expect(promise).resolves.toMatchObject({
      videos: [{ url: 'https://a.com/v.mp4' }],
    });
  });

  it('settles captured media requests when scans go idle', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');
    const empty = JSON.stringify({
      type: 'pageScan',
      data: { url: 'https://a.com', title: 't', videos: [], images: [] },
    });

    onWebViewRequest('https://cdn.example/live/stream.m3u8');
    onGenericWebViewMessage(empty);
    onGenericWebViewMessage(empty);
    onGenericWebViewMessage(empty);
    vi.advanceTimersByTime(8_000);
    onGenericWebViewMessage(empty);
    await expect(promise).resolves.toMatchObject({
      videos: [{ url: 'https://cdn.example/live/stream.m3u8' }],
    });
  });

  it('probes wide candidates in capped batches', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');
    const scan = (dims: Record<string, [number, number]>) =>
      JSON.stringify({
        type: 'pageScan',
        data: {
          url: 'https://a.com',
          title: 't',
          videos: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((id) => {
            const d = dims[id];
            return d
              ? { url: `https://c.example/${id}.mp4`, width: d[0], height: d[1] }
              : { url: `https://c.example/${id}.mp4` };
          }),
          images: [],
        },
      });
    const probeCalls = () =>
      handle.injectJavaScript.mock.calls.filter((call) =>
        String(call[0]).includes('__phantom_probe')
      );

    onGenericWebViewMessage(scan({}));
    expect(probeCalls()).toHaveLength(4);

    onGenericWebViewMessage(
      scan({ u1: [1920, 1080], u2: [1920, 1080], u3: [1920, 1080], u4: [1920, 1080] })
    );
    expect(probeCalls()).toHaveLength(6);

    onGenericWebViewMessage(
      scan({
        u1: [1920, 1080],
        u2: [1920, 1080],
        u3: [1920, 1080],
        u4: [1920, 1080],
        u5: [1920, 1080],
        u6: [1920, 1080],
      })
    );
    await expect(promise).resolves.toMatchObject({
      videos: [
        { url: 'https://c.example/u1.mp4', height: 1080 },
        { url: 'https://c.example/u2.mp4' },
        { url: 'https://c.example/u3.mp4' },
        { url: 'https://c.example/u4.mp4' },
        { url: 'https://c.example/u5.mp4' },
        { url: 'https://c.example/u6.mp4' },
      ],
    });
  });

  it('settles with the freshest scan when probes stay silent', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');

    onGenericWebViewMessage(
      JSON.stringify({
        type: 'pageScan',
        data: {
          url: 'https://a.com',
          title: 't',
          videos: [{ url: 'https://c.example/u1.mp4' }],
          images: [],
        },
      })
    );
    expect(handle.injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('__phantom_probe("https://c.example/u1.mp4")')
    );

    vi.advanceTimersByTime(1_500);
    await expect(promise).resolves.toMatchObject({
      videos: [{ url: 'https://c.example/u1.mp4' }],
    });
  });

  it('dedupes identical in-flight urls', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const first = extractFromPage('https://a.com');
    const second = extractFromPage('https://a.com');

    expect(handle.navigate).toHaveBeenCalledTimes(1);
    onGenericWebViewMessage(scanMessage('https://a.com'));
    await expect(first).resolves.toMatchObject({ url: 'https://a.com' });
    await expect(second).resolves.toMatchObject({ url: 'https://a.com' });
  });

  it('does not inject while idle', () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    onWebViewPageEnded('https://a.com');
    expect(handle.injectJavaScript).not.toHaveBeenCalled();
  });

  it('resolves null on timeout', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');

    vi.advanceTimersByTime(30_000);
    await expect(promise).resolves.toBeNull();
    expect(handle.navigate).toHaveBeenCalled();
  });

  it('resolves null on http error for the active page', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');

    onWebViewHttpError('https://a.com');
    await expect(promise).resolves.toBeNull();
  });

  it('ignores http errors from subresources', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');

    onWebViewHttpError('https://cdn.example/logo.png');
    expect(handle.navigate).toHaveBeenCalledTimes(1);

    onGenericWebViewMessage(scanMessage('https://a.com'));
    await expect(promise).resolves.toMatchObject({ url: 'https://a.com' });
  });

  it('resolves null on load failure', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');

    onWebViewFailed();
    await expect(promise).resolves.toBeNull();
  });

  it('resolves null when app backgrounds', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');

    listeners[0]('background');
    await expect(promise).resolves.toBeNull();
  });

  it('detach resolves pending and queued', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const first = extractFromPage('https://a.com');
    const second = extractFromPage('https://b.com');

    detachGenericWebView();
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
  });
});

describe('hls manifest probing', () => {
  const hlsScan = () =>
    JSON.stringify({
      type: 'pageScan',
      data: {
        url: 'https://a.com',
        title: 't',
        videos: [{ url: 'https://cdn.example/hls/master.m3u8' }],
        images: [],
      },
    });
  const hlsResult = (videos: object[]) =>
    JSON.stringify({
      type: 'hls',
      data: { url: 'https://cdn.example/hls/master.m3u8', videos },
    });
  const variants = [
    {
      url: 'https://cdn.example/hls/1080/index.m3u8',
      type: 'm3u8',
      width: 1920,
      height: 1080,
    },
    { url: 'https://cdn.example/hls/720/index.m3u8', type: 'm3u8', width: 1280, height: 720 },
  ];
  const hlsCalls = (handle: ReturnType<typeof makeHandle>) =>
    handle.injectJavaScript.mock.calls.filter((call) =>
      String(call[0]).includes('__phantom_hls')
    );

  it('fetches m3u8 manifests via __phantom_hls, not the video probe', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');

    onGenericWebViewMessage(hlsScan());
    expect(hlsCalls(handle)).toHaveLength(1);
    expect(handle.injectJavaScript).not.toHaveBeenCalledWith(
      expect.stringContaining('__phantom_probe')
    );

    onGenericWebViewMessage(hlsResult(variants));
    vi.advanceTimersByTime(1_500);
    await expect(promise).resolves.toMatchObject({
      url: 'https://a.com',
      videos: [
        { url: 'https://cdn.example/hls/1080/index.m3u8', height: 1080 },
        { url: 'https://cdn.example/hls/720/index.m3u8', height: 720 },
        { url: 'https://cdn.example/hls/master.m3u8' },
      ],
    });
  });

  it('holds the settle while manifest fetches are in flight', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    let settled: 'pending' | 'done' = 'pending';
    const promise = extractFromPage('https://a.com');
    void promise.then(() => {
      settled = 'done';
    });

    onGenericWebViewMessage(hlsScan());
    expect(hlsCalls(handle)).toHaveLength(1);
    vi.advanceTimersByTime(3_000);
    expect(settled).toBe('pending');

    onGenericWebViewMessage(hlsResult(variants));
    vi.advanceTimersByTime(1_500);
    await expect(promise).resolves.toMatchObject({
      videos: [
        { url: 'https://cdn.example/hls/1080/index.m3u8', height: 1080 },
        { url: 'https://cdn.example/hls/720/index.m3u8', height: 720 },
        { url: 'https://cdn.example/hls/master.m3u8' },
      ],
    });
  });

  it('settles with the raw manifest when the fetch yields no variants', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');

    onGenericWebViewMessage(hlsScan());
    onGenericWebViewMessage(hlsResult([]));
    vi.advanceTimersByTime(1_500);
    await expect(promise).resolves.toMatchObject({
      videos: [{ url: 'https://cdn.example/hls/master.m3u8' }],
    });
  });

  it('ignores stale hls results from a previous injection', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    let settled: 'pending' | 'done' = 'pending';
    const promise = extractFromPage('https://a.com');
    void promise.then(() => {
      settled = 'done';
    });

    onGenericWebViewMessage(hlsScan());
    onGenericWebViewMessage(JSON.stringify({ ...JSON.parse(hlsResult(variants)), id: 0 }));
    vi.advanceTimersByTime(1_500);
    expect(settled).toBe('pending');

    onGenericWebViewMessage(hlsResult(variants));
    vi.advanceTimersByTime(1_500);
    await expect(promise).resolves.toMatchObject({
      videos: [
        { url: 'https://cdn.example/hls/1080/index.m3u8', height: 1080 },
        { url: 'https://cdn.example/hls/720/index.m3u8', height: 720 },
        { url: 'https://cdn.example/hls/master.m3u8' },
      ],
    });
  });
});

describe('media request interception', () => {
  it('records media requests into the final scan', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');

    onWebViewRequest('https://cdn.example/video.mp4');
    onGenericWebViewMessage(scanMessage('https://a.com'));
    const scan = await promise;

    expect(scan?.videos.map((video) => video.url)).toEqual([
      'https://cdn.example/video.mp4',
      'https://a.com/v.mp4',
    ]);
  });

  it('holds a direct media paste until the probe reports dims', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    let settled: 'pending' | 'done' = 'pending';
    const promise = extractFromPage('https://cdn.example/movie.m3u8');
    void promise.then(() => {
      settled = 'done';
    });

    // probe page in flight: the target's own request must not resolve it
    onWebViewRequest('https://cdn.example/movie.m3u8');
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe('pending');
    expect(handle.navigate).toHaveBeenCalledWith(
      expect.stringContaining('data:text/html')
    );

    onGenericWebViewMessage(
      JSON.stringify({
        type: 'pageScan',
        data: {
          url: 'data:text/html;charset=utf-8,probe',
          title: '',
          videos: [
            { url: 'https://cdn.example/movie.m3u8', width: 1920, height: 1080 },
          ],
          images: [],
        },
      })
    );
    const scan = await promise;

    expect(scan).toEqual({
      url: 'https://cdn.example/movie.m3u8',
      title: '',
      videos: [{ url: 'https://cdn.example/movie.m3u8', height: 1080, width: 1920 }],
      images: [],
      isDirect: true,
    });
  });

  it('settles a direct media paste plain when metadata stays silent', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://cdn.example/movie.mov');

    onGenericWebViewMessage(
      JSON.stringify({
        type: 'pageScan',
        data: {
          url: 'data:text/html;charset=utf-8,probe',
          title: '',
          videos: [{ url: 'https://cdn.example/movie.mov' }],
          images: [],
        },
      })
    );
    expect(handle.injectJavaScript).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_500);
    await expect(promise).resolves.toMatchObject({
      url: 'https://cdn.example/movie.mov',
      videos: [{ url: 'https://cdn.example/movie.mov' }],
    });
  });

  it('probes xhr-sourced streams and upgrades dims when metadata loads', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');

    onGenericWebViewMessage(
      JSON.stringify({
        type: 'pageScan',
        data: {
          url: 'https://a.com',
          title: 't',
          videos: [{ url: 'https://cdn.example/stream.mov' }],
          images: [],
        },
      })
    );
    expect(handle.injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('__phantom_probe("https://cdn.example/stream.mov")')
    );
    onGenericWebViewMessage(
      JSON.stringify({
        type: 'pageScan',
        data: {
          url: 'https://a.com',
          title: 't',
          videos: [
            { url: 'https://cdn.example/stream.mov', width: 1920, height: 1080 },
          ],
          images: [],
        },
      })
    );
    await expect(promise).resolves.toMatchObject({
      videos: [{ url: 'https://cdn.example/stream.mov', height: 1080 }],
    });
  });

  it('ignores non-media requests', async () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    const promise = extractFromPage('https://a.com');

    onWebViewRequest('https://cdn.example/style.css');
    onWebViewRequest('https://cdn.example/banner.jpg');
    onGenericWebViewMessage(scanMessage('https://a.com'));
    const scan = await promise;

    expect(scan?.videos.map((video) => video.url)).toEqual([
      'https://a.com/v.mp4',
    ]);
  });

  it('ignores requests while idle', () => {
    const handle = makeHandle();
    attachGenericWebView(handle);
    onWebViewRequest('https://cdn.example/video.mp4');
    expect(handle.navigate).not.toHaveBeenCalled();
  });
});
