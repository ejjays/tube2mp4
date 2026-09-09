import { describe, it, expect, vi } from 'vitest';
import { sendEvent as _sendEvent } from '../../src/utils/network/sse.util.js';
import { getInfo as _getInfo } from '../../src/services/extractors/index.js';
import { isSupportedUrl as _isSupportedUrl } from '../../src/utils/network/validation.util.js';
import { getVideoInfo } from '../../src/services/ytdlp/info.js';
import { VideoInfo } from '../../src/types/index.js';

vi.mock('../../src/utils/network/sse.util.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendEvent: vi.fn(),
}));

vi.mock('../../src/services/extractors/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getInfo: vi.fn(),
}));

vi.mock(
  '../../src/utils/network/validation.util.js',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    isSupportedUrl: vi.fn(),
  })
);

import { sendEvent } from '../../src/utils/network/sse.util.js';
import { getInfo } from '../../src/services/extractors/index.js';
import { isSupportedUrl } from '../../src/utils/network/validation.util.js';

describe('SSE Realtime Regression', () => {
  it('should capture expected SSE events during extraction', async () => {
    const capturedEvents: Array<{
      id: string;
      subStatus: string;
      [key: string]: unknown;
    }> = [];

    // mock send event
    vi.mocked(sendEvent).mockImplementation(
      (id: string, data: { subStatus: string; [key: string]: unknown }) => {
        capturedEvents.push({ id, ...data });
      }
    );

    // mock extract info
    vi.mocked(getInfo).mockImplementation(
      (
        _url: string,
        options?: {
          onProgress?: (
            status: string,
            progress: number,
            subStatus: string,
            detail: string
          ) => void;
        }
      ) => {
        if (options?.onProgress) {
          options.onProgress(
            'fetching_info',
            15,
            'Scanning Test...',
            'TEST_DETAILS'
          );
        }
        return Promise.resolve({
          id: 'test',
          formats: [{ formatId: '1', url: 'https://ex.com', ext: 'mp4' }],
          title: 'Test',
          uploader: 'Test User',
          thumbnail: 'https://ex.com/thumb.jpg',
          webpageUrl: 'https://ex.com/watch',
        } as VideoInfo);
      }
    );

    // mock validation
    vi.mocked(isSupportedUrl).mockReturnValue(true);

    const url = 'https://vt.tiktok.com/ZS123456/';

    await getVideoInfo(url, [], false, null, 'reg-123');

    // await async
    await new Promise((res) => setTimeout(res, 100));

    console.log(
      'Captured statuses:',
      capturedEvents.map((event) => event.subStatus)
    );

    expect(capturedEvents.map((event) => event.subStatus)).toEqual([
      'Expanding short-links...',
      'Scanning Test...',
    ]);
  });
});
