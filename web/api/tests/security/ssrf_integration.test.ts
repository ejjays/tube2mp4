import { describe, it, expect, vi } from 'vitest';
import { pipeWebStream } from '../../src/utils/network/proxy.util.js';
import { Response } from 'express';
import { PassThrough } from 'node:stream';

describe('SSRF Integration: pipeWebStream', () => {
  it('blocks request to 127.0.0.1', async () => {
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    } as unknown as Response;

    await expect(
      pipeWebStream('http://127.0.0.1:6379', mockRes)
    ).rejects.toThrow(/SSRF Blocked/);
  });

  it('blocks request to localtest.me', async () => {
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    } as unknown as Response;

    await expect(pipeWebStream('http://localtest.me', mockRes)).rejects.toThrow(
      /SSRF Blocked/
    );
  });

  it('allows request to a public domain (Google)', async () => {
    // use passthrough
    const mockResStream = new PassThrough();

    // mock response
    const mockRes = Object.assign(mockResStream, {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      headersSent: false,
      getHeader: vi.fn().mockReturnValue(null),
    }) as unknown as Response;

    // check SSRF
    try {
      await pipeWebStream(
        'https://www.google.com/robots.txt',
        mockRes,
        'robots.txt'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toMatch(/SSRF Blocked/);
    }
  }, 15000); // 15s timeout
});
