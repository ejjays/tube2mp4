import { describe, it, expect } from 'vitest';
import { tlsRejectUnauthorized } from '../../src/utils/network/proxy.util.js';

/**
 * M2: TLS verification was disabled for 4 CDNs (rejectUnauthorized:!isCDN),
 * allowing MITM on proxied media. Now verified by default; bypass is opt-in.
 */
describe('tlsRejectUnauthorized (M2)', () => {
  it('verifies TLS by default for CDN and non-CDN hosts', () => {
    expect(tlsRejectUnauthorized('r1.googlevideo.com', {})).toBe(true);
    expect(tlsRejectUnauthorized('scontent.fbcdn.net', {})).toBe(true);
    expect(tlsRejectUnauthorized('example.com', {})).toBe(true);
  });

  it('bypasses TLS only for CDN hosts when opt-in flag is set', () => {
    const env = { PROXY_ALLOW_INSECURE_TLS: 'true' } as NodeJS.ProcessEnv;
    expect(tlsRejectUnauthorized('r1.googlevideo.com', env)).toBe(false);
    expect(tlsRejectUnauthorized('v.tiktokv.com', env)).toBe(false);
    expect(tlsRejectUnauthorized('example.com', env)).toBe(true);
  });
});
