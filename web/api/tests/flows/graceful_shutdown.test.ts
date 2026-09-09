import { describe, it, expect, vi } from 'vitest';
import type { Server } from 'node:http';
import { setupGracefulShutdown } from '../../src/utils/infra/shutdown.util.js';

// minimal server stub with a controllable close
function fakeServer(closeImpl: (cb: () => void) => void): Server {
  return { close: closeImpl } as unknown as Server;
}

describe('setupGracefulShutdown', () => {
  it('drains then exits 0 and runs onClose', async () => {
    const exit = vi.fn();
    const onClose = vi.fn().mockResolvedValue();
    const server = fakeServer((cb) => cb());

    const shutdown = setupGracefulShutdown(server, { exit, onClose });
    shutdown('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onClose).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('force-exits 1 if connections never close', async () => {
    const exit = vi.fn();
    const server = fakeServer(() => {}); // simulate a hung close

    const shutdown = setupGracefulShutdown(server, { exit, timeoutMs: 20 });
    shutdown('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('is idempotent across repeated signals', async () => {
    const exit = vi.fn();
    const server = fakeServer((cb) => cb());

    const shutdown = setupGracefulShutdown(server, { exit });
    shutdown('SIGTERM');
    shutdown('SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(exit).toHaveBeenCalledOnce();
  });
});
