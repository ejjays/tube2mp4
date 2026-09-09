import { describe, it, expect } from 'vitest';
import { configureServerTimeouts } from '../../src/utils/infra/server-timeouts.util.js';

/**
 * M8: a 20-min window covering the request-receive phase let slowloris hold
 * connection slots open. Now the request phase is bounded short while the
 * response phase (long downloads) keeps its long timeout.
 */
describe('configureServerTimeouts (M8)', () => {
  it('bounds the request phase but keeps a long response window', () => {
    const server = {
      timeout: 0,
      keepAliveTimeout: 0,
      headersTimeout: 0,
      requestTimeout: 0,
    };
    configureServerTimeouts(server);

    // request-receive window is short (slowloris defense)
    expect(server.requestTimeout).toBeLessThanOrEqual(60000);
    expect(server.headersTimeout).toBeLessThanOrEqual(60000);
    // long response streaming preserved for 4K downloads
    expect(server.timeout).toBeGreaterThanOrEqual(1200000);
    // node race guard: headers must outlast keep-alive
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });
});
