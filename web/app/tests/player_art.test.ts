import { describe, it, expect } from 'vitest';
import { getPlayerArt } from '../src/components/MusicPlayerCard';

/**
 * regression: 30s preview album art was blank. it read data.imageUrl
 * (usually undefined; strict FinalResponse drops it) instead of cover.
 */
describe('getPlayerArt', () => {
  it('prefers cover over imageUrl', () => {
    expect(
      getPlayerArt({ cover: 'https://x/c.jpg', imageUrl: 'https://x/i.jpg' })
    ).toBe('https://x/c.jpg');
  });

  it('falls back to imageUrl when cover missing', () => {
    expect(getPlayerArt({ imageUrl: 'https://x/i.jpg' })).toBe(
      'https://x/i.jpg'
    );
  });

  it('falls back to logo when no art', () => {
    expect(getPlayerArt(null)).toBe('/logo.webp');
    expect(getPlayerArt({})).toBe('/logo.webp');
  });
});
