import './instrument.js';
import 'dotenv/config';
import dns from 'node:dns';
import { startCipherRotation } from './utils/network/cipher.util.js';

startCipherRotation();
import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { traceContext } from './utils/infra/trace.util.js';
import { randomUUID } from 'node:crypto';
import db from './utils/infra/db.util.js';
import videoRoutes from './routes/video.routes.js';
import {
  requireApiKey,
  requireLocalOrApiKey,
  assertProdConfig,
} from './utils/network/auth.util.js';
import { logger } from './utils/infra/logger.util.js';
import { setupGracefulShutdown } from './utils/infra/shutdown.util.js';
import { configureServerTimeouts } from './utils/infra/server-timeouts.util.js';
import { closeAllRedis } from './utils/infra/redis.util.js';
import { startJanitor } from './utils/infra/janitor.util.js';
import { warmUp } from './utils/infra/warmup.util.js';
import {
  metricsMiddleware,
  getMetrics,
  recordFailure,
} from './utils/infra/metrics.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// termux bypass
if (process.platform === 'android') {
  try {
    const { Module } = await import('module');
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function (
      this: unknown,
      name: string,
      ...args: unknown[]
    ) {
      if (name === '@ffmpeg-installer/ffmpeg') {
        return {
          path: 'ffmpeg',
          version: 'system',
          url: 'https://ffmpeg.org/',
        };
      }
      if (name.includes('libsql')) {
        try {
          return (
            originalRequire as (...innerArgs: unknown[]) => unknown
          ).apply(this, [name, ...args]);
        } catch (_ERROR) {
          logger.debug('[System] LibSQL bypass error:', _ERROR);
          logger.warn(
            `[System] LibSQL native library '${name}' not found, bypassing...`
          );
          return {
            createClient: () => ({
              execute: () => Promise.resolve({ rows: [] }),
              batch: () => Promise.resolve([]),
              close: () => {},
            }),
          };
        }
      }
      if (name === 'msgpackr-extract' || name === 'cpu-features') {
        return null;
      }
      return (originalRequire as (...innerArgs: unknown[]) => unknown).apply(
        this,
        [name, ...args]
      );
    };
    logger.info('[System] Mocked native modules for Termux compatibility');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[System] Failed to mock @ffmpeg-installer/ffmpeg: ${message}`);
  }
}

const dnsModule = dns as unknown as {
  setDefaultResultOrder?: (order: 'ipv4first' | 'ipv6first') => void;
};
if (dnsModule.setDefaultResultOrder) {
  dnsModule.setDefaultResultOrder('ipv4first');
}

process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error(`[Unhandled] reason: ${message}`);
});
process.on('uncaughtException', (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`[Uncaught] error: ${message}`);
  if (err instanceof Error && err.stack) logger.error(err.stack);
});

const app = express();
app.set('trust proxy', 1);

app.use(metricsMiddleware);

const PORT = Number(process.env.PORT) || 5000;

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // no inline scripts; styles inline (hardened later)
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https:', 'wss:'],
      },
    },
  })
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/', globalLimiter);

const infoLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Extraction rate limit exceeded. Slow down!' },
});

app.use(['/info', '/stream-urls'], infoLimiter);

// skip HEAD (resume); no SSE compression
const convertLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.method === 'HEAD',
  message: { error: 'Download rate limit exceeded. Slow down!' },
});

app.use('/convert', convertLimiter);

const seedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Seeder rate limit exceeded.' },
});

app.use('/seed-intelligence', seedLimiter);

app.use(
  compression({
    filter: (req, res) => {
      if (req.path === '/events') return false;
      if (res.getHeader('Content-Type') === 'text/event-stream') return false;
      return compression.filter(req, res);
    },
  })
);

app.use((req: Request, res: Response, next: NextFunction) => {
  const traceId =
    (req.headers['x-correlation-id'] as string) ||
    (req.query.id as string) ||
    randomUUID().split('-')[0];

  res.setHeader('X-Trace-Id', traceId);

  Sentry.withIsolationScope((scope) => {
    if (process.env.SENTRY_DSN) {
      scope.setTag('traceId', traceId);
    }

    traceContext.run({ traceId }, () => {
      next();
    });
  });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/ping' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const traceId =
    (traceContext.getStore() as { traceId?: string })?.traceId || 'global';
  logger.info(
    `[${timestamp}] [${traceId}] ${req.method} ${req.originalUrl || req.url}`
  );
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;
  const allowlist = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (origin) {
    const openMode = allowlist.length === 0;
    if (openMode) {
      res.header('Access-Control-Allow-Origin', '*');
    } else if (allowlist.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Credentials', 'true');
    }
  }
  res.header(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS, PATCH'
  );
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Last-Event-ID, ngrok-skip-browser-warning, bypass-tunnel-reminder, sentry-trace, baggage'
  );
  res.header(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

logger.info('--- Environment Check ---');
logger.info(`PORT: ${PORT}`);
logger.info(
  `COOKIES_URL: ${process.env.COOKIES_URL ? '✅ LOADED' : '❌ MISSING'}`
);
logger.info(
  `GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ LOADED' : '❌ MISSING'}`
);
logger.info(
  `GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '✅ LOADED' : '❌ MISSING'}`
);
logger.info(
  `BILIBILI_COOKIE: ${process.env.BILIBILI_COOKIE ? '✅ LOADED' : '➖ not set (720p cap)'}`
);
logger.info(
  `INFO CACHE: ${process.env.DISABLE_INFO_CACHE && process.env.DISABLE_INFO_CACHE !== '0' ? '🚫 DISABLED (testing)' : '✅ ENABLED'}`
);

dns.lookup('google.com', { family: 4 }, (err, addr) => {
  const status = err ? '❌ FAILED' : `✅ ${addr}`;
  logger.info(`DNS google.com: ${status}`);
});
dns.lookup('youtube.com', { family: 4 }, (err, addr) => {
  const status = err ? '❌ FAILED' : `✅ ${addr}`;
  logger.info(`DNS youtube.com: ${status}`);
});
logger.info('-------------------------');

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

const TEMP_DIR = path.join(__dirname, 'temp');
const CACHE_DIR = path.join(TEMP_DIR, 'yt-dlp-cache');

[TEMP_DIR, CACHE_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

logger.info('[System] Initializing routes...');
app.get('/ping', (_req: Request, res: Response) => {
  res.status(200).send('pong');
});

app.get('/api/get-url', async (_req: Request, res: Response) => {
  try {
    if (db) {
      const result = (await db.execute({
        sql: "SELECT value FROM configs WHERE key = 'BACKEND_URL' LIMIT 1",
        args: [],
      })) as unknown as { rows: Array<{ value: string }> };
      if (result.rows.length > 0) {
        res.json({ url: result.rows[0].value });
        return;
      }
    }
  } catch (error) {
    logger.error('[Discovery] Error fetching URL:', error);
  }
  res.json({ url: null });
});

// opt-in auth; gated: localhost or API_KEY only
app.use(['/info', '/stream-urls', '/convert', '/proxy'], requireApiKey);
app.use('/', videoRoutes);
logger.info('[System] Routes ready');

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    port: PORT,
  });
});

app.get('/metrics', requireLocalOrApiKey, (_req: Request, res: Response) => {
  res.status(200).json(getMetrics());
});

// global error handler: hide internals in production
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const reason = err instanceof Error ? err.name : 'UnknownError';
  recordFailure(reason);
  logger.error({ err, path: req.path, method: req.method }, 'request error');
  if (!res.headersSent) {
    const details =
      process.env.NODE_ENV === 'production'
        ? undefined
        : err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : JSON.stringify(err);
    res.status(500).json({ error: 'Internal Server Error', details });
  }
});

const distPath = path.join(__dirname, '../../../../app/dist');

if (fs.existsSync(distPath) && process.env.API_ONLY !== 'true') {
  app.use(express.static(distPath));
  app.get(/.*/u, (req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith('/events') ||
      req.path.startsWith('/info') ||
      req.path.startsWith('/convert') ||
      req.path.startsWith('/stream-urls') ||
      req.path.startsWith('/proxy') ||
      req.path.startsWith('/api') ||
      req.path.includes('/EME_STREAM_DOWNLOAD/')
    ) {
      next();
      return;
    }

    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (_req: Request, res: Response) => {
    res.send('YouTube to MP4 Backend is running!');
  });
}

export default app;

if (process.env.NODE_ENV !== 'test') {
  assertProdConfig();
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server is running on port ${PORT}`);

    configureServerTimeouts(server);

    setupGracefulShutdown(server, { onClose: closeAllRedis });

    import('./services/ytdlp/info.js').then(({ startPeerKeepWarm }) =>
      startPeerKeepWarm()
    );

    import('./services/ytdlp/config.js').then(({ bootstrapCookies }) =>
      bootstrapCookies()
    );

    import('node:child_process').then(({ exec, spawn: spawnChild }) => {
      exec('yt-dlp --version', (err, stdout) => {
        if (err) logger.error(`yt-dlp check failed: ${err.message}`);
        else logger.info(`yt-dlp: ${stdout.trim()}`);
      });

      exec('ffmpeg -version', (err, stdout) => {
        if (err) logger.error(`FFmpeg check failed: ${err.message}`);
        else logger.info(`FFmpeg: ${stdout.split('\n')[0]}`);
      });

      // pot opt-in; bgutil currently fails botguard
      const potEnabled = process.env.ENABLE_POT_PLUGIN === '1';
      if (!potEnabled) {
        logger.info('[PO Token] disabled; set ENABLE_POT_PLUGIN=1 to enable');
      } else {
        const potCandidates = [
          process.env.HOME
            ? path.resolve(
                process.env.HOME,
                'bgutil-ytdlp-pot-provider/server/build/main.js'
              )
            : null,
          '/root/bgutil-ytdlp-pot-provider/server/build/main.js',
          '/data/data/com.termux/files/home/bgutil-ytdlp-pot-provider/server/build/main.js',
        ].filter((candidate): candidate is string => Boolean(candidate));
        try {
          const potScript = potCandidates.find((candidate) =>
            fs.existsSync(candidate)
          );
          if (potScript) {
            const pot = spawnChild('node', [potScript], {
              stdio: 'ignore',
              detached: true,
            });
            pot.unref();
            logger.info(
              `PO Token server started (pid: ${pot.pid}, port: 4416)`
            );
          } else {
            logger.info(
              `[PO Token] Server script not found in: ${potCandidates.join(', ')}`
            );
          }
        } catch (error: unknown) {
          logger.error('[PO Token] Spawn failed:', (error as Error).message);
        }
      }
    });

    warmUp();

    // log memory levers for resource tuning
    setTimeout(() => {
      const mem = process.memoryUsage();
      const mb = (bytes: number) => Math.round(bytes / 1048576);
      const limit = process.env.KOYEB_INSTANCE_MEMORY_MB || '?';
      logger.info(
        `[Mem] idle snapshot: rss=${mb(mem.rss)}MB heapUsed=${mb(mem.heapUsed)}MB ` +
          `heapTotal=${mb(mem.heapTotal)}MB external=${mb(mem.external)}MB ` +
          `arrayBuffers=${mb(mem.arrayBuffers)}MB (instance limit=${limit}MB)`
      );
    }, 6000).unref();
  });
}

startJanitor({ tempDir: TEMP_DIR, db });
