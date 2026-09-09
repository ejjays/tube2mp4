import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Response } from 'express';
import { setupStreamListeners } from '../../src/utils/media/stream.util.js';
import * as sseUtil from '../../src/utils/network/sse.util.js'; // skipcq: JS-C1003

// ensure consistent branding in logs

describe('setupStreamListeners — subStatus label', () => {
  let sendEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendEventSpy = vi.spyOn(sseUtil, 'sendEvent').mockImplementation(() => {});
  });

  afterEach(() => {
    sendEventSpy.mockRestore();
  });

  // mock express response stream
  function makeRes(): Response {
    return new PassThrough() as unknown as Response;
  }

  it('emits "Streaming via Turbo" — never "EME" — on first chunk', async () => {
    const sourceStream = new PassThrough();
    const res = makeRes();
    const totalBytesSent = { value: 0 };
    const clientId = 'turboLabelClient_1';

    setupStreamListeners(sourceStream, res, clientId, totalBytesSent);

    sourceStream.write(Buffer.from('hello-world-payload'));
    sourceStream.end();

    await new Promise((resolve) => setTimeout(resolve, 50));

    const transmitting = sendEventSpy.mock.calls.find(
      ([, event]) =>
        typeof (event as { subStatus?: string })?.subStatus === 'string' &&
        (event as { subStatus: string }).subStatus.startsWith('TRANSMITTING:')
    );
    expect(transmitting).toBeDefined();
    const subStatus = (transmitting?.[1] as { subStatus: string }).subStatus;
    expect(subStatus).toContain('Turbo');
    expect(subStatus).not.toContain('EME');
  });

  it('does not emit any "via EME" subStatus across the full stream lifecycle', async () => {
    const sourceStream = new PassThrough();
    const res = makeRes();
    const totalBytesSent = { value: 0 };
    const clientId = 'turboLabelClient_2';

    setupStreamListeners(sourceStream, res, clientId, totalBytesSent);

    sourceStream.write(Buffer.alloc(64));
    sourceStream.write(Buffer.alloc(300 * 1024));
    sourceStream.end();
    sourceStream.emit('close');

    await new Promise((resolve) => setTimeout(resolve, 50));

    const eventsWithEme = sendEventSpy.mock.calls.filter(([, event]) => {
      const sub = (event as { subStatus?: string })?.subStatus;
      return typeof sub === 'string' && sub.includes('EME');
    });
    expect(eventsWithEme).toHaveLength(0);
  });
});
