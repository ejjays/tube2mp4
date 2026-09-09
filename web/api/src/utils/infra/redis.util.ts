import { Redis, type RedisOptions } from 'ioredis';
import { logger } from './logger.util.js';
import { isHost } from '../network/host.util.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const isExternal =
  isHost(REDIS_URL, 'upstash.io') ||
  isHost(REDIS_URL, 'aivencloud.com') ||
  REDIS_URL.includes('valkey');

export const getRedisOptions = (overrides: Partial<RedisOptions> = {}) => {
  return {
    connectTimeout: 20000,
    maxRetriesPerRequest: null,
    keepAlive: 10000,
    retryStrategy(times: number) {
      const delay = Math.min(times * 500, 2000);
      return delay;
    },
    tls: isExternal
      ? {
          rejectUnauthorized: true,
        }
      : undefined,
    ...overrides,
  };
};

const loggedErrors = new Set<string>();
const loggedConnects = new Set<string>();
const redisInstances = new Map<string, Redis>();

export const createRedisClient = (
  name = 'default',
  overrides: Partial<RedisOptions> = {}
) => {
  const existing = redisInstances.get(name);
  if (existing) return existing;

  const client = new Redis(REDIS_URL, getRedisOptions(overrides));
  redisInstances.set(name, client);

  client.on('connect', () => {
    loggedErrors.delete(`${name}_connect_error`);
    // log first connect, skip reconnects
    if (loggedConnects.has(name)) return;
    loggedConnects.add(name);
    const type = isExternal ? 'External' : 'Local';
    logger.info(`[Redis] ${name} connected to ${type} instance`);
  });

  client.on('error', (err: NodeJS.ErrnoException) => {
    const errorKey = `${name}_${err.code || 'error'}`;

    // throttle error logs
    if (!loggedErrors.has(errorKey)) {
      if (err.code === 'ETIMEDOUT') {
        logger.error(
          `[Redis] ${name} connection timed out. Check network/whitelisting.`
        );
      } else if (err.code === 'ECONNREFUSED') {
        logger.error(
          `[Redis] ${name} connection refused. Is Redis running locally?`
        );
      } else {
        logger.error(`[Redis] ${name} error: ${err.message}`);
      }
      loggedErrors.add(errorKey);

      // reset error log
      setTimeout(() => loggedErrors.delete(errorKey), 300000);
    }
  });

  return client;
};

// prevent duplicate cluster jobs
export async function acquireSingletonLock(
  key: string,
  ttlSeconds: number
): Promise<boolean> {
  try {
    const client = createRedisClient('locks');
    const result = await client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch {
    // fail safe if REDIS down
    return false;
  }
}

export default createRedisClient;

// quit all tracked clients on shutdown
export const closeAllRedis = async (): Promise<void> => {
  for (const client of redisInstances.values()) {
    // disconnect is immediate; quit can hang offline
    try {
      client.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }
  redisInstances.clear();
  await Promise.resolve();
};
