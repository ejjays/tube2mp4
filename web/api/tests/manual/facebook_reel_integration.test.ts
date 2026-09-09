import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getInfo } from '../../src/services/extractors/facebook/index.js';
import { VideoInfo, ExtractorOptions } from '../../src/types/index.js';

describe('Facebook Reel JS Extractor (Integration-style)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should extract metadata and streams for a live Reel URL', async () => {
    // hits network
    const reelUrl = 'https://www.facebook.com/share/r/1P9rv4BUT7/';

    const options: ExtractorOptions = { cookie_name: 'Cristel Jm Verga' };
    const info = (await getInfo(reelUrl, options)) as VideoInfo;

    expect(info).not.toBeNull();
    expect(info.id).toBeDefined();

    // validate content
    expect(info.title).toBeDefined();
    expect(info.title.length).toBeGreaterThan(5);

    expect(info.uploader).toBeDefined();
    expect(info.uploader.length).toBeGreaterThan(3);

    expect(info.formats.length).toBeGreaterThan(0);

    expect(info.formats.length).toBeGreaterThan(0);
  });
});
