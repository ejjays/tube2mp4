// loaded before any env reads (sentry dsn, LOG_LEVEL) — instrument.js runs
// before app.js's own dotenv import
import 'dotenv/config';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import { logger } from './utils/infra/logger.util.js';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

process.on('uncaughtException', async (error) => {
  logger.error('[Uncaught Exception]', error);
  Sentry.captureException(error);
  await Sentry.close(2000);
  throw error;
});

process.on('unhandledRejection', (reason) => {
  logger.error('[Unhandled Rejection]', reason);
  Sentry.captureException(reason);
});
