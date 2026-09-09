import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProgress } from '../src/hooks/useProgress';
import { useAppStore } from '../src/store/useAppStore';

/**
 * verifies tiered progress milestones in useProgress.
 * snaps bar forward at meaningful state changes to
 * avoid "stuck at 50%" perception during scans.
 */

const ORIGINAL_STATE = useAppStore.getState();

beforeEach(() => {
  // reset progress state
  useAppStore.setState({
    isPickerOpen: false,
    videoData: null,
    targetProgress: 0,
    progress: 0,
    status: 'idle',
  } as unknown as Parameters<typeof useAppStore.setState>[0]);
});

afterEach(() => {
  vi.useRealTimers();
  // restore base store
  useAppStore.setState(
    ORIGINAL_STATE as unknown as Parameters<typeof useAppStore.setState>[0]
  );
});

describe('useProgress — tiered milestones', () => {
  it('bumps targetProgress to >=70 when picker opens with a title (early hit)', () => {
    renderHook(() => useProgress());

    act(() => {
      useAppStore.setState({
        status: 'initializing',
        isPickerOpen: true,
        targetProgress: 45,
        videoData: {
          title: 'Some Video',
          formats: [],
        },
      } as unknown as Parameters<typeof useAppStore.setState>[0]);
    });

    expect(useAppStore.getState().targetProgress).toBeGreaterThanOrEqual(70);
  });

  it('bumps to >=90 when picker has at least one format', () => {
    renderHook(() => useProgress());

    act(() => {
      useAppStore.setState({
        status: 'initializing',
        isPickerOpen: true,
        targetProgress: 70,
        videoData: {
          title: 'Some Video',
          formats: [{ formatId: '137', height: 1080 }],
        },
      } as unknown as Parameters<typeof useAppStore.setState>[0]);
    });

    expect(useAppStore.getState().targetProgress).toBeGreaterThanOrEqual(90);
  });

  it('bumps to >=95 when isFullData=true', () => {
    renderHook(() => useProgress());

    act(() => {
      useAppStore.setState({
        status: 'initializing',
        isPickerOpen: true,
        targetProgress: 90,
        videoData: {
          title: 'Some Video',
          formats: [{ formatId: '137', height: 1080 }],
          isFullData: true,
        },
      } as unknown as Parameters<typeof useAppStore.setState>[0]);
    });

    expect(useAppStore.getState().targetProgress).toBeGreaterThanOrEqual(95);
  });

  it('does NOT bump when the picker is closed', () => {
    renderHook(() => useProgress());

    act(() => {
      useAppStore.setState({
        status: 'initializing',
        isPickerOpen: false,
        targetProgress: 30,
        videoData: {
          title: 'Some Video',
          formats: [{ formatId: '137', height: 1080 }],
          isFullData: true,
        },
      } as unknown as Parameters<typeof useAppStore.setState>[0]);
    });

    // ignore closed picker
    expect(useAppStore.getState().targetProgress).toBe(30);
  });

  it('does NOT bump backwards when current is already past the milestone', () => {
    renderHook(() => useProgress());

    act(() => {
      useAppStore.setState({
        status: 'initializing',
        isPickerOpen: true,
        targetProgress: 92, // past milestone
        videoData: {
          title: 'Some Video',
          formats: [{ formatId: '137', height: 1080 }],
        },
      } as unknown as Parameters<typeof useAppStore.setState>[0]);
    });

    // avoid backwards clamp
    expect(useAppStore.getState().targetProgress).toBe(92);
  });

  it('progresses through all three tiers as videoData evolves', () => {
    renderHook(() => useProgress());

    // tier 1: title
    act(() => {
      useAppStore.setState({
        status: 'initializing',
        isPickerOpen: true,
        targetProgress: 50,
        videoData: { title: 'X', formats: [] },
      } as unknown as Parameters<typeof useAppStore.setState>[0]);
    });
    expect(useAppStore.getState().targetProgress).toBe(70);

    // tier 2: formats
    act(() => {
      useAppStore.setState({
        videoData: { title: 'X', formats: [{ formatId: '1', height: 720 }] },
      } as unknown as Parameters<typeof useAppStore.setState>[0]);
    });
    expect(useAppStore.getState().targetProgress).toBe(90);

    // tier 3: full
    act(() => {
      useAppStore.setState({
        videoData: {
          title: 'X',
          formats: [{ formatId: '1', height: 720 }],
          isFullData: true,
        },
      } as unknown as Parameters<typeof useAppStore.setState>[0]);
    });
    expect(useAppStore.getState().targetProgress).toBe(95);
  });
});
