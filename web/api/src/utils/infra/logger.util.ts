import pino from 'pino';
import { getTraceId } from './trace.util.js';

type LooseLogFn = (objOrMsg?: unknown, msgOrArg?: unknown, ...args: unknown[]) => void;

type LooseLogger = Omit<
  pino.Logger,
  'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
> & {
  trace: LooseLogFn;
  debug: LooseLogFn;
  info: LooseLogFn;
  warn: LooseLogFn;
  error: LooseLogFn;
  fatal: LooseLogFn;
};

export const logger: LooseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  mixin() {
    const traceId = getTraceId();
    return traceId ? { traceId } : {};
  },
  transport:
    process.env.NODE_ENV !== 'production' &&
    process.env.NODE_ENV !== 'test' &&
    !process.env.VITEST &&
    process.platform !== 'android'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
});
