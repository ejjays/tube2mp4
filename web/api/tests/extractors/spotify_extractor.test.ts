import { describe, it, expect } from 'vitest';
import { getInfo } from '../../src/services/extractors/spotify.js';
import { VideoInfo } from '../../src/types/index.js';

describe('Spotify Extractor (Mocked)', () => {
  const url = 'https://open.spotify.com/track/1xwtOTVFN4MsGEKpGyKfIV';

  it('should parse metadata correctly using mocked data', async () => {
    const info = (await getInfo(url)) as VideoInfo;

    expect(info).toBeDefined();
    expect(info.title).toBe('Awit Ng Bayan (Mocked)');
    expect(info.artist).toBe('Victory Worship');
    expect(info.id).toBeDefined();
    expect(info.isrc).toBe('FR2X41721331'); // check mocked ISRC
    expect(info.previewUrl).toBe('https://p.scdn.co/mp3-preview/mocked');
  });

  it('should return null for non-existent tracks (404)', async () => {
    const errorUrl = 'https://open.spotify.com/track/error404';
    const info = await getInfo(errorUrl);
    expect(info).toBeNull();
  });
});
