import { describe, it, expect, vi, beforeEach } from 'vitest';
import { globalMediaGuard } from '../../src/utils/network/security.util.js';
import createRedisClient from '../../src/utils/infra/redis.util.js';
import type { Request, Response } from 'express';

function mockRes() {
  const handlers: Record<string, () => void> = {};
  const res = {
    statusCode: 0,
    on(event: string, handler: () => void) {
      handlers[event] = handler;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json: vi.fn(),
    fire(event: string) {
      handlers[event]?.();
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    fire: (e: string) => void;
  };
}

// let async zrem settle
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('globalMediaGuard', () => {
  beforeEach(async () => {
    await createRedisClient('security').del('media:active');
  });

  it('caps concurrent jobs and frees the slot on release', async () => {
    const guard = globalMediaGuard(1);
    const req = {} as Request;

    const res1 = mockRes();
    const next1 = vi.fn();
    await guard(req, res1, next1);
    expect(next1).toHaveBeenCalledOnce();

    const res2 = mockRes();
    const next2 = vi.fn();
    await guard(req, res2, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(503);

    res1.fire('close');
    await flush();

    const res3 = mockRes();
    const next3 = vi.fn();
    await guard(req, res3, next3);
    expect(next3).toHaveBeenCalledOnce();
  });
});
