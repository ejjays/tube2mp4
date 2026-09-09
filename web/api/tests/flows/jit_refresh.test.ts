import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshPreviewIfNeeded } from '../../src/services/spotify/index.js';
import { SpotifyMetadata } from '../../src/types/index.js';

// mock brain
vi.mock('../../src/services/spotify/brain.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/services/spotify/brain.js')
    >();
  return {
    ...actual,
    updatePreviewInBrain: vi.fn().mockImplementation(() => Promise.resolve()),
  };
});

describe('JIT Refresh Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should refresh expiring Deezer links', async () => {
    const brainData: Partial<SpotifyMetadata> = {
      title: 'Risk It All',
      artist: 'Bruno Mars',
      previewUrl: 'https://cdnt-preview.dzcdn.net/api/1/1/expired',
      isrc: 'FR2X41721331',
      duration: 204000, // track duration
    };

    await refreshPreviewIfNeeded(
      'https://open.spotify.com/track/test',
      brainData as SpotifyMetadata
    );

    // expect MSW mock
    expect(brainData.previewUrl).toBe('https://p.scdn.co/mp3-preview/mocked');
  });

  it('should refresh expiring iTunes links', async () => {
    const brainData: Partial<SpotifyMetadata> = {
      title: 'Risk It All',
      artist: 'Bruno Mars',
      previewUrl: 'https://audio-ssl.itunes.apple.com/expired.m4a',
      isrc: 'FR2X41721331',
    };

    await refreshPreviewIfNeeded(
      'https://open.spotify.com/track/test',
      brainData as SpotifyMetadata
    );

    expect(brainData.previewUrl).toBe('https://p.scdn.co/mp3-preview/mocked');
  });

  it('should ignore static CDNs', async () => {
    const staticUrl = 'https://my-cdn.com/static.mp3';
    const brainData: Partial<SpotifyMetadata> = {
      title: 'Risk It All',
      artist: 'Bruno Mars',
      previewUrl: staticUrl,
      isrc: 'USAT22509142',
    };

    await refreshPreviewIfNeeded(
      'https://open.spotify.com/track/test',
      brainData as SpotifyMetadata
    );

    expect(brainData.previewUrl).toBe(staticUrl);
  });
});
