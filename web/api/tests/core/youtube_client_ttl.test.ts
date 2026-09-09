import { describe, it, expect } from 'vitest';
import { isClientStale } from '../../src/services/extractors/youtube/client.js';

/**
 * M6: the Innertube client was cached forever, so once YouTube rotated its
 * cipher the cached decipher went stale and downloads broke until restart.
 * A TTL recreates the client so it self-heals.
 */
describe('isClientStale (M6)', () => {
  it('is stale when the client was never created', () => {
    expect(isClientStale(0, 1000, 1000)).toBe(true);
  });

  it('is fresh while within the ttl', () => {
    expect(isClientStale(1000, 1500, 1000)).toBe(false);
  });

  it('is stale once the ttl has elapsed', () => {
    expect(isClientStale(1000, 2000, 1000)).toBe(true);
  });
});
