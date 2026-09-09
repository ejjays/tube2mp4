import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockMediaSource {
  isTypeSupported: ReturnType<typeof vi.fn>;
}

interface MockMediaCapabilities {
  decodingInfo: ReturnType<typeof vi.fn>;
}

declare global {
  // skipcq: JS-0102
  var MediaSource: MockMediaSource | undefined;
}

beforeEach(() => {
  vi.resetModules();
  globalThis.MediaSource = undefined;
  // reset navigator.mediaCapabilities between runs
  Object.defineProperty(globalThis.navigator, 'mediaCapabilities', {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

async function importFresh() {
  return await import('../src/lib/codec-support');
}

function setMediaCapabilities(mc?: MockMediaCapabilities) {
  Object.defineProperty(globalThis.navigator, 'mediaCapabilities', {
    value: mc,
    configurable: true,
    writable: true,
  });
}

describe('codec-support: AV1 detection and filtering', () => {
  it.each([
    {
      name: 'smooth+powerEfficient',
      decodingInfo: { supported: true, smooth: true, powerEfficient: true },
      expected: true,
    },
    {
      name: 'smooth=false (software decode)',
      decodingInfo: { supported: true, smooth: false, powerEfficient: false },
      expected: false,
    },
    {
      name: 'powerEfficient=false',
      decodingInfo: { supported: true, smooth: true, powerEfficient: false },
      expected: false,
    },
  ])(
    'initAV1Support returns $expected when $name',
    async ({ decodingInfo, expected }) => {
      setMediaCapabilities({ decodingInfo: vi.fn().mockResolvedValue(decodingInfo) });
      const { initAV1Support, supportsAV1 } = await importFresh();
      await initAV1Support();
      expect(supportsAV1()).toBe(expected);
    }
  );

  it('falls back to MediaSource sync probe when MediaCapabilities missing', async () => {
    setMediaCapabilities();
    globalThis.MediaSource = {
      isTypeSupported: vi.fn().mockReturnValue(false),
    };
    const { supportsAV1 } = await importFresh();
    expect(supportsAV1()).toBe(false);
  });

  it('flags AV1 by vcodec prefix', async () => {
    const { isAV1Format } = await importFresh();
    expect(isAV1Format({ vcodec: 'av01.0.05M.08' })).toBe(true);
    expect(isAV1Format({ vcodec: 'avc1.640028' })).toBe(false);
    expect(isAV1Format({ vcodec: 'vp09.00.50.08' })).toBe(false);
  });

  it('flags AV1 by formatId fallback', async () => {
    const { isAV1Format } = await importFresh();
    expect(isAV1Format({ formatId: '399' })).toBe(true);
    expect(isAV1Format({ formatId: '401' })).toBe(true);
    expect(isAV1Format({ formatId: '137' })).toBe(false);
  });

  it('filters out AV1 when smooth decode unavailable', async () => {
    setMediaCapabilities({
      decodingInfo: vi.fn().mockResolvedValue({
        supported: true,
        smooth: false,
        powerEfficient: false,
      }),
    });
    const { initAV1Support, filterUnsupportedCodecs } = await importFresh();
    await initAV1Support();

    const formats = [
      { formatId: '137', vcodec: 'avc1.640028' },
      { formatId: '399', vcodec: 'av01.0.08M.08' },
      { formatId: '248', vcodec: 'vp09.00.50.08' },
    ];
    const filtered = filterUnsupportedCodecs(formats);
    expect(filtered.map((f) => f.formatId)).toEqual(['137', '248']);
  });

  it('keeps AV1 formats when smooth decode confirmed', async () => {
    setMediaCapabilities({
      decodingInfo: vi.fn().mockResolvedValue({
        supported: true,
        smooth: true,
        powerEfficient: true,
      }),
    });
    const { initAV1Support, filterUnsupportedCodecs } = await importFresh();
    await initAV1Support();

    const formats = [
      { formatId: '137', vcodec: 'avc1' },
      { formatId: '399', vcodec: 'av01.0.08M.08' },
    ];
    const filtered = filterUnsupportedCodecs(formats);
    expect(filtered).toHaveLength(2);
  });
});
