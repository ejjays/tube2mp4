import { describe, it, expect, beforeEach } from 'vitest';
import createRedisClient, {
  acquireSingletonLock,
} from '../../src/utils/infra/redis.util.js';

describe('acquireSingletonLock', () => {
  beforeEach(async () => {
    await createRedisClient('locks').del('test:singleton');
  });

  it('grants the lock to the first caller only', async () => {
    const first = await acquireSingletonLock('test:singleton', 60);
    const second = await acquireSingletonLock('test:singleton', 60);
    const third = await acquireSingletonLock('test:singleton', 60);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(third).toBe(false);
  });

  it('uses an independent key per lock name', async () => {
    const lockA = await acquireSingletonLock('test:singleton', 60);
    const lockB = await acquireSingletonLock('test:singleton:other', 60);
    expect(lockA).toBe(true);
    expect(lockB).toBe(true);
  });
});
