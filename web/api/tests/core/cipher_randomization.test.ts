import { describe, it, expect, afterEach } from 'vitest';
import tls from 'node:tls';
import {
  randomizeCiphers,
  startCipherRotation,
} from '../../src/utils/network/cipher.util.js';

describe('TLS Cipher Randomization', () => {
  const originalCiphers = tls.DEFAULT_CIPHERS;

  afterEach(() => {
    tls.DEFAULT_CIPHERS = originalCiphers;
  });

  it('changes cipher order on each call', () => {
    randomizeCiphers();
    const first = tls.DEFAULT_CIPHERS;
    randomizeCiphers();
    const second = tls.DEFAULT_CIPHERS;

    expect(first).not.toBe(originalCiphers);
    expect(second).not.toBe(first);
  });

  it('preserves total cipher count', () => {
    const originalCount = originalCiphers.split(':').length;
    randomizeCiphers();
    expect(tls.DEFAULT_CIPHERS.split(':')).toHaveLength(originalCount);
  });

  it('only shuffles top 8 ciphers', () => {
    randomizeCiphers();
    const afterShuffle = tls.DEFAULT_CIPHERS.split(':');
    const originalList = originalCiphers.split(':');

    // ciphers after position 8 should be unchanged
    expect(afterShuffle.slice(8)).toEqual(originalList.slice(8));
  });

  it('top 8 contains same ciphers in different order', () => {
    randomizeCiphers();
    const shuffledTop = tls.DEFAULT_CIPHERS.split(':').slice(0, 8).sort();
    const originalTop = originalCiphers.split(':').slice(0, 8).sort();

    expect(shuffledTop).toEqual(originalTop);
  });

  it('startCipherRotation applies immediately', () => {
    startCipherRotation();
    expect(tls.DEFAULT_CIPHERS).not.toBe(originalCiphers);
  });
});
