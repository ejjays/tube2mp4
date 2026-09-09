import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';
import {
  signProxyParams,
  verifyProxyParams,
} from '../../src/utils/network/secrets.util.js';
import { buildProxyUrl } from '../../src/utils/media/stream.util.js';
import type { Format } from '../../src/types/index.js';

const params = {
  targetUrl: 'https://www.youtube.com/watch?v=abc',
  rawUrl: 'https://r1.googlevideo.com/videoplayback?id=xyz',
  formatId: '18',
};

describe('proxy URL signing', () => {
  it('verifies a freshly signed link', () => {
    const { exp, sig } = signProxyParams(params);
    expect(verifyProxyParams({ ...params, exp, sig })).toBe(true);
  });

  it('rejects a tampered targetUrl', () => {
    const { exp, sig } = signProxyParams(params);
    expect(
      verifyProxyParams({ ...params, targetUrl: 'https://evil.com', exp, sig })
    ).toBe(false);
  });

  it('rejects a tampered rawUrl', () => {
    const { exp, sig } = signProxyParams(params);
    expect(
      verifyProxyParams({ ...params, rawUrl: 'https://evil.com', exp, sig })
    ).toBe(false);
  });

  it('rejects a missing signature', () => {
    const { exp } = signProxyParams(params);
    expect(verifyProxyParams({ ...params, exp, sig: undefined })).toBe(false);
  });

  it('rejects a forged signature of equal length', () => {
    const { exp, sig } = signProxyParams(params);
    const forged = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    expect(verifyProxyParams({ ...params, exp, sig: forged })).toBe(false);
  });

  it('rejects an expired but correctly-signed link', async () => {
    vi.resetModules();
    vi.stubEnv('PROXY_URL_TTL_SECONDS', '-1');
    const mod = await import('../../src/utils/network/secrets.util.js');
    const { exp, sig } = mod.signProxyParams(params);
    expect(mod.verifyProxyParams({ ...params, exp, sig })).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe('buildProxyUrl ↔ verify round-trip', () => {
  const req = {
    headers: {},
    get: () => 'localhost:5000',
    protocol: 'http',
  } as unknown as Request;

  // direct format includes an encoded rawUrl
  const directFormat = {
    formatId: '22',
    extension: 'mp4',
    url: 'https://r1.googlevideo.com/videoplayback?id=xyz&n=abc&mime=video/mp4',
  } as unknown as Format;

  const targetUrl = 'https://www.youtube.com/watch?v=abc&t=1';

  it('a freshly minted signed URL verifies after URL decoding', () => {
    const signed = buildProxyUrl(req, directFormat, targetUrl);
    expect(signed).toBeTruthy();
    const params = new URL(signed as string).searchParams;
    expect(
      verifyProxyParams({
        targetUrl: params.get('targetUrl') ?? undefined,
        rawUrl: params.get('rawUrl') ?? undefined,
        formatId: params.get('formatId') ?? undefined,
        exp: Number(params.get('exp')),
        sig: params.get('sig') ?? undefined,
      })
    ).toBe(true);
  });

  it('swapping the decoded targetUrl breaks verification', () => {
    const signed = buildProxyUrl(req, directFormat, targetUrl);
    const params = new URL(signed as string).searchParams;
    expect(
      verifyProxyParams({
        targetUrl: 'https://evil.com',
        rawUrl: params.get('rawUrl') ?? undefined,
        formatId: params.get('formatId') ?? undefined,
        exp: Number(params.get('exp')),
        sig: params.get('sig') ?? undefined,
      })
    ).toBe(false);
  });
});
