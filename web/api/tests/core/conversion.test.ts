import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';

describe('Conversion Engine (Automation Proof)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should verify that we can detect a hanging stream', async () => {
    const mockStream = new Readable({
      read() {
        // simulate hanging stream
      },
    });

    let dataReceived = false;
    const monitorPromise = new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(
        () => reject(new Error('Test Hanged!')),
        1000
      );

      mockStream.on('data', () => {
        dataReceived = true;
        clearTimeout(timeoutId);
        resolve();
      });
    });

    // fast-forward time
    vi.advanceTimersByTime(1000);

    await expect(monitorPromise).rejects.toThrow('Test Hanged!');
    expect(dataReceived).toBe(false);
  });
});
