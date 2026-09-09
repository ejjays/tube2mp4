import { it, describe, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveAndValidateHost,
  isSafeIp,
} from '../../src/utils/network/security.util.js';
import { lookup } from 'node:dns/promises';

vi.mock('node:dns/promises', () => {
  const actual = vi.importActual('node:dns/promises');
  return {
    ...actual,
    lookup: vi.fn(),
  };
});

describe('SSRF Protection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should block private IP ranges', async () => {
    const privateIps = ['127.0.0.1', '192.168.1.1', '10.0.0.1', '172.16.0.1'];
    for (const ip of privateIps) {
      await expect(resolveAndValidateHost(ip)).rejects.toThrow('SSRF Blocked');
    }
  });

  it('should block IPv6 literals and loopback addresses', async () => {
    // test extraction
    const ipv6Private = ['::', '::1', 'fc00::', 'fe80::1', '::ffff:127.0.0.1'];
    for (const ip of ipv6Private) {
      expect(isSafeIp(ip)).toBe(false);
      await expect(resolveAndValidateHost(ip)).rejects.toThrow('SSRF Blocked');
    }
  });

  it('should block Cloud Metadata Endpoints (169.254.169.254)', async () => {
    expect(isSafeIp('169.254.169.254')).toBe(false);
    await expect(resolveAndValidateHost('169.254.169.254')).rejects.toThrow(
      'SSRF Blocked'
    );
  });

  it('should prevent DNS Rebinding attacks by enforcing validation at lookup', async () => {
    // mock lookup
    let lookupCount = 0;
    vi.mocked(lookup).mockImplementation(
      (hostname: string, _options: unknown) => {
        lookupCount++;
        if (hostname === 'attacker-rebind.com') {
          if (lookupCount === 1)
            return Promise.resolve({ address: '8.8.8.8', family: 4 } as {
              address: string;
              family: number;
            }); // safe lookup
          return Promise.resolve({ address: '127.0.0.1', family: 4 } as {
            address: string;
            family: number;
          }); // malicious lookup
        }
        return Promise.resolve({ address: '8.8.8.8', family: 4 } as {
          address: string;
          family: number;
        });
      }
    );

    // simulate resolution
    const firstResolution = await resolveAndValidateHost('attacker-rebind.com');
    expect(firstResolution).toBe('8.8.8.8');

    // verify failure
    await expect(resolveAndValidateHost('attacker-rebind.com')).rejects.toThrow(
      'SSRF Blocked'
    );
  });

  it('should allow public IP ranges', async () => {
    vi.mocked(lookup).mockImplementation(() => {
      return Promise.resolve({ address: '8.8.8.8', family: 4 } as {
        address: string;
        family: number;
      });
    });
    const publicIps = ['8.8.8.8', '1.1.1.1'];
    for (const ip of publicIps) {
      const result = await resolveAndValidateHost(ip);
      expect(result).toBe(ip);
    }
  });
});
