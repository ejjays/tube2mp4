import type { Server } from 'node:http';
import { logger } from './logger.util.js';

interface ShutdownOptions {
  timeoutMs?: number;
  onClose?: () => void | Promise<void>;
  exit?: (code?: number) => void;
}

// drain in-flight then exit; force on timeout
export function setupGracefulShutdown(
  server: Server,
  options: ShutdownOptions = {}
): (signal: string) => void {
  const { timeoutMs = 10000, onClose, exit = process.exit } = options;
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`[Shutdown] ${signal} received, draining connections...`);
    // bail if connections never close
    const force = setTimeout(() => exit(1), timeoutMs);
    force.unref();
    server.close(() => {
      Promise.resolve(onClose?.())
        .catch(() => {})
        .finally(() => {
          clearTimeout(force);
          exit(0);
        });
    });
    // release idle keep-alives so drain finishes
    (server as { closeIdleConnections?: () => void }).closeIdleConnections?.();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return shutdown;
}
