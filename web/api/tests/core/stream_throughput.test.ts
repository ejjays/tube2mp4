import { describe, it, expect } from 'vitest';
import { PassThrough, Readable } from 'node:stream';
import { Response } from 'express';
import { setupStreamListeners } from '../../src/utils/media/stream.util.js';

// pipeline overhead floor

const MB = 1024 * 1024;

function makeChunkedSource(
  totalBytes: number,
  chunkBytes = 64 * 1024
): Readable {
  let written = 0;
  return new Readable({
    read() {
      if (written >= totalBytes) {
        this.push(null);
        return;
      }
      const remaining = totalBytes - written;
      const len = Math.min(chunkBytes, remaining);
      this.push(Buffer.alloc(len));
      written += len;
    },
  });
}

describe('setupStreamListeners — throughput regression', () => {
  it.each([
    { sizeMb: 16, chunkKb: 64, label: '16MB @ 64KB chunks' },
    { sizeMb: 32, chunkKb: 256, label: '32MB @ 256KB chunks' },
    { sizeMb: 8, chunkKb: 4, label: '8MB @ 4KB chunks (small-chunk stress)' },
  ])(
    'pipes $label intact at >=30 MB/s through Transform observer',
    async ({ sizeMb, chunkKb }) => {
      const totalBytes = sizeMb * MB;
      const source = makeChunkedSource(totalBytes, chunkKb * 1024);
      const sink = new PassThrough();

      let firstByteAt = 0;
      let totalReceived = 0;

      sink.on('data', (chunk: Buffer) => {
        if (firstByteAt === 0) firstByteAt = Date.now();
        totalReceived += chunk.length;
      });

      const t0 = Date.now();
      const totalBytesSent = { value: 0 };

      setupStreamListeners(
        source,
        sink as unknown as Response,
        'throughput_test',
        totalBytesSent
      );

      await new Promise<void>((resolve) => sink.on('end', () => resolve()));

      const totalMs = Math.max(1, Date.now() - t0);
      const ttfbMs = firstByteAt > 0 ? firstByteAt - t0 : -1;
      const mbps = totalReceived / MB / (totalMs / 1000);

      // log exact numbers
      console.log(
        `[Throughput][setupStreamListeners] size=${sizeMb}MB chunk=${chunkKb}KB total=${totalMs}ms TTFB=${ttfbMs}ms => ${mbps.toFixed(2)} MB/s`
      );

      expect(totalReceived).toBe(totalBytes);
      expect(mbps).toBeGreaterThan(30);
      expect(ttfbMs).toBeGreaterThanOrEqual(0);
      expect(ttfbMs).toBeLessThan(200);
    },
    20_000
  );

  it('does not corrupt bytes through the observer', async () => {
    const totalBytes = 4 * MB;
    const sentinel = Buffer.alloc(64 * 1024);
    for (let i = 0; i < sentinel.length; i++) sentinel[i] = i & 0xff;

    const chunks: Buffer[] = [];
    let written = 0;
    const source = new Readable({
      read() {
        if (written >= totalBytes) {
          this.push(null);
          return;
        }
        this.push(sentinel);
        written += sentinel.length;
      },
    });

    const sink = new PassThrough();
    sink.on('data', (chunk: Buffer) => chunks.push(chunk));

    const totalBytesSent = { value: 0 };
    setupStreamListeners(
      source,
      sink as unknown as Response,
      'integrity_test',
      totalBytesSent
    );

    await new Promise<void>((resolve) => sink.on('end', () => resolve()));

    const received = Buffer.concat(chunks);
    expect(received).toHaveLength(totalBytes);
    // verify byte pattern preserved
    for (let offset = 0; offset < received.length; offset += sentinel.length) {
      expect(
        received.subarray(offset, offset + sentinel.length).equals(sentinel)
      ).toBe(true);
    }
  });
});
