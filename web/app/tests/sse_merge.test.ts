import { describe, it, expect, vi } from 'vitest';
import { handleSseMessage } from '../src/hooks/useSSE';

/**
 * regression tests for SSE metadata_update merging.
 *
 * prevents race condition where quality picker locks at 360p.
 * this happens when a late /info HTTP response (limited Innertube formats)
 * overwrites a previous, richer SSE push (yt-dlp formats).
 *
 * ensure we always keep the fuller list for formats/audioFormats,
 * even if events arrive out of order.
 *
 * calls handleSseMessage directly to check merged result
 * without spinning up a full React tree.
 */

interface VideoDataLike {
  formats?: unknown[];
  audioFormats?: unknown[];
  isFullData?: boolean;
  isPartial?: boolean;
  title?: string;
  artist?: string;
  [key: string]: unknown;
}

function runHandler(
  prev: VideoDataLike | null,
  update: Record<string, unknown>,
  status?: string
): VideoDataLike {
  let captured: VideoDataLike | null = prev;
  const setVideoData = vi.fn((updater: unknown) => {
    if (typeof updater === 'function') {
      captured = (updater as (p: unknown) => VideoDataLike)(captured);
    } else {
      captured = updater as VideoDataLike;
    }
  });

  handleSseMessage(
    {
      status,
      metadata_update: update,
    },
    'https://www.youtube.com/watch?v=test',
    {
      setStatus: vi.fn(),
      setVideoData,
      setIsPickerOpen: vi.fn(),
      setPendingSubStatuses: vi.fn(),
      setDesktopLogs: vi.fn(),
      setTargetProgress: vi.fn(),
      setProgress: vi.fn(),
      setSubStatus: vi.fn(),
      getTS: () => '[0:01]',
    }
  );

  expect(setVideoData).toHaveBeenCalled();
  return captured as VideoDataLike;
}

describe('handleSseMessage — merge keeps the fuller format list', () => {
  it('uses the new (richer) formats when prev was empty/null', () => {
    const merged = runHandler(null, {
      formats: [{ formatId: 'a' }, { formatId: 'b' }],
      audioFormats: [{ formatId: 'au1' }],
      title: 'X',
      isFullData: true,
      isPartial: false,
    });

    expect(merged.formats).toHaveLength(2);
    expect(merged.audioFormats).toHaveLength(1);
  });

  it('keeps the prev (richer) formats when the new update has fewer', () => {
    const prev: VideoDataLike = {
      formats: Array.from({ length: 16 }, (_, i) => ({ formatId: `f${i}` })),
      audioFormats: Array.from({ length: 4 }, (_, i) => ({
        formatId: `a${i}`,
      })),
      isFullData: true,
      isPartial: false,
    };

    const merged = runHandler(prev, {
      // Stale "JS resolution complete" arriving AFTER yt-dlp enhancement.
      formats: [{ formatId: 'only-360p' }],
      audioFormats: [],
      isFullData: true,
      isPartial: false,
    });

    expect(merged.formats).toHaveLength(16);
    expect(merged.audioFormats).toHaveLength(4);
  });

  it('uses the new formats when both lists tie on length (idempotent)', () => {
    const prev: VideoDataLike = {
      formats: [{ formatId: 'old1' }, { formatId: 'old2' }],
    };

    const merged = runHandler(prev, {
      formats: [{ formatId: 'new1' }, { formatId: 'new2' }],
    });

    // newFormats.length >= prevFormats.length wins on equality.
    expect(merged.formats).toEqual([
      { formatId: 'new1' },
      { formatId: 'new2' },
    ]);
  });

  it('upgrades from limited to full when the enhancement event arrives later', () => {
    // Simulates the real flow:
    //   1. JS-resolution-complete event   -> 1 format
    //   2. yt-dlp-enhancement event       -> 16 formats
    let videoData: VideoDataLike | null = null;

    videoData = runHandler(videoData, {
      formats: [{ formatId: 'js-360' }],
      isFullData: true,
      isPartial: false,
    });
    expect(videoData.formats).toHaveLength(1);

    videoData = runHandler(videoData, {
      formats: Array.from({ length: 16 }, (_, i) => ({ formatId: `yt${i}` })),
      isFullData: true,
      isPartial: false,
    });
    expect(videoData.formats).toHaveLength(16);
  });

  it('preserves non-format fields from the new update (title, artist, thumbnail)', () => {
    const prev: VideoDataLike = {
      formats: [{ formatId: 'a' }, { formatId: 'b' }, { formatId: 'c' }],
      title: 'Old Title',
      artist: 'Old Artist',
    };

    const merged = runHandler(prev, {
      formats: [{ formatId: 'x' }], // fewer; should be ignored
      title: 'New Title',
      artist: 'New Artist',
    });

    expect(merged.formats).toHaveLength(3); // kept prev
    expect(merged.title).toBe('New Title'); // updated
    expect(merged.artist).toBe('New Artist'); // updated
  });
});

describe('handleSseMessage — guard against full -> partial regressions', () => {
  it('ignores a partial update if prev is already full', () => {
    const prev: VideoDataLike = {
      formats: Array.from({ length: 5 }, (_, i) => ({ formatId: `f${i}` })),
      isFullData: true,
      isPartial: false,
    };

    const merged = runHandler(prev, {
      formats: [{ formatId: 'tiny' }],
      isPartial: true, // explicit partial flag
    });

    // The early "isFullData=true && update.isPartial=true" guard kicks in
    // and returns prev unchanged — 5 formats preserved.
    expect(merged.formats).toHaveLength(5);
    expect(merged.isFullData).toBe(true);
  });
});

describe('handleSseMessage — handles missing format fields safely', () => {
  it('does not crash when update has no formats key at all', () => {
    const prev: VideoDataLike = {
      formats: [{ formatId: 'a' }, { formatId: 'b' }],
      audioFormats: [{ formatId: 'au' }],
    };

    const merged = runHandler(prev, {
      title: 'Just a title update',
    });

    // No formats in update -> prev formats preserved.
    expect(merged.formats).toHaveLength(2);
    expect(merged.audioFormats).toHaveLength(1);
    expect(merged.title).toBe('Just a title update');
  });

  it('does not crash when update.formats is not an array', () => {
    const prev: VideoDataLike = {
      formats: [{ formatId: 'a' }],
    };

    const merged = runHandler(prev, {
      formats: 'this is not an array' as unknown as unknown[],
    });

    expect(merged.formats).toHaveLength(1);
  });
});

describe('handleSseMessage — isPartial cannot revert once formats exist', () => {
  it('ignores a late early-hit partial (no isFullData) when formats present', () => {
    // prev mimics the HTTP /info response: formats but isFullData stripped
    const prev: VideoDataLike = {
      formats: [{ formatId: 'v1' }, { formatId: 'v2' }],
      isPartial: false,
    };

    const merged = runHandler(prev, {
      title: 'early hit',
      formats: [],
      isPartial: true,
    });

    expect(merged.formats).toHaveLength(2);
    expect(merged.isPartial).toBe(false);
  });
});
