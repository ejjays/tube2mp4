import { describe, it, expect, vi } from 'vitest';
import { handleSseMessage } from '../src/hooks/useSSE';

/**
 * verifies sse to desktopLogs flow.
 * ensures subStatus and details are logged correctly.
 * handles de-duplication and branch isolation.
 */

interface LogState {
  desktopLogs: string[];
  pendingSubStatuses: string[];
  subStatus: string;
}

function runWithRecordedState() {
  const state: LogState = {
    desktopLogs: ['[0:00] Initializing Phantom Core Engine...'],
    pendingSubStatuses: [],
    subStatus: '',
  };

  const setDesktopLogs = vi.fn((updater: unknown) => {
    if (typeof updater === 'function') {
      state.desktopLogs = (updater as (prev: string[]) => string[])(
        state.desktopLogs
      );
    } else {
      state.desktopLogs = updater as string[];
    }
  });

  const setPendingSubStatuses = vi.fn((updater: unknown) => {
    if (typeof updater === 'function') {
      state.pendingSubStatuses = (updater as (prev: string[]) => string[])(
        state.pendingSubStatuses
      );
    } else {
      state.pendingSubStatuses = updater as string[];
    }
  });

  const setSubStatus = vi.fn((ss: string) => {
    state.subStatus = ss;
  });

  const dispatch = (data: Record<string, unknown>) =>
    handleSseMessage(data, 'https://www.youtube.com/watch?v=x', {
      setStatus: vi.fn(),
      setVideoData: vi.fn(),
      setIsPickerOpen: vi.fn(),
      setPendingSubStatuses,
      setDesktopLogs,
      setTargetProgress: vi.fn(),
      setProgress: vi.fn(),
      setSubStatus,
      getTS: () => '[0:01]',
    });

  return { state, dispatch, setDesktopLogs, setPendingSubStatuses };
}

describe('handleSseMessage — desktopLogs append', () => {
  it('appends a log line when a subStatus event arrives', () => {
    const { state, dispatch } = runWithRecordedState();

    dispatch({ subStatus: 'Decrypting streams...' });

    expect(state.desktopLogs).toHaveLength(2);
    expect(state.desktopLogs[1]).toBe('[0:01] Decrypting streams...');
  });

  it('appends a log line when a details event arrives', () => {
    const { state, dispatch } = runWithRecordedState();

    dispatch({ details: 'NETWORK: RESOLVING_REDIRECTS' });

    expect(state.desktopLogs).toHaveLength(2);
    expect(state.desktopLogs[1]).toBe('[0:01] NETWORK: RESOLVING_REDIRECTS');
  });

  it('drops the paired details and keeps only the subStatus', () => {
    const { state, dispatch } = runWithRecordedState();

    dispatch({
      subStatus: 'Expanding short-links...',
      details: 'NETWORK: RESOLVING_REDIRECTS',
    });

    // paired details is decorative; only the subStatus is logged
    expect(state.desktopLogs).toHaveLength(2);
    expect(state.desktopLogs[1]).toBe('[0:01] Expanding short-links...');
  });

  it('grows linearly across many events (no clobber, no reset)', () => {
    const { state, dispatch } = runWithRecordedState();

    const events: Array<Record<string, unknown>> = [
      { subStatus: 'Initializing Session...' },
      { subStatus: 'Bypassing restricted clients...' },
      { subStatus: 'Expanding short-links...' },
      { subStatus: 'Decrypting streams...' },
      { subStatus: 'Metadata found!' },
      { subStatus: 'Quality resolution enhanced.' },
    ];
    for (const event of events) dispatch(event);

    expect(state.desktopLogs).toHaveLength(1 + events.length);
    expect(state.desktopLogs[1]).toContain('Initializing Session');
    expect(state.desktopLogs[6]).toContain('Quality resolution enhanced');
  });

  it('also appends when a metadata_update event arrives alongside subStatus', () => {
    const { state, dispatch } = runWithRecordedState();

    dispatch({
      subStatus: 'Metadata found!',
      metadata_update: {
        title: 'Test',
        artist: 'Author',
        formats: [],
        isPartial: true,
      },
    });

    expect(state.desktopLogs).toHaveLength(2);
    expect(state.desktopLogs[1]).toContain('Metadata found');
  });

  it('does not crash when setDesktopLogs receives a function updater', () => {
    // handle functional updater
    const { dispatch, setDesktopLogs } = runWithRecordedState();
    dispatch({ subStatus: 'Anything' });

    // check mock function
    const lastCall =
      setDesktopLogs.mock.calls[setDesktopLogs.mock.calls.length - 1];
    expect(typeof lastCall[0]).toBe('function');
  });

  it('de-duplicates immediate repeats of the same subStatus log', () => {
    const { state, dispatch } = runWithRecordedState();

    dispatch({ subStatus: 'Decrypting streams...' });
    dispatch({ subStatus: 'Decrypting streams...' });
    dispatch({ subStatus: 'Decrypting streams...' });

    // de-dup log entries
    expect(state.desktopLogs).toHaveLength(2);
  });

  it('appends pendingSubStatuses for non-STREAM-ESTABLISHED events', () => {
    const { state, dispatch } = runWithRecordedState();

    dispatch({ subStatus: 'Decrypting streams...' });

    expect(state.pendingSubStatuses).toEqual(['Decrypting streams...']);
    expect(state.subStatus).toBe('');
  });

  it('routes STREAM ESTABLISHED to setSubStatus, not pendingSubStatuses', () => {
    const { state, dispatch } = runWithRecordedState();

    dispatch({ subStatus: 'STREAM ESTABLISHED — yt-dlp -> ffmpeg' });

    expect(state.pendingSubStatuses).toEqual([]);
    expect(state.subStatus).toContain('STREAM ESTABLISHED');
    // log still appended
    expect(state.desktopLogs).toHaveLength(2);
  });
});

describe('handleSseMessage — branch isolation', () => {
  /**
   * If setVideoData throws (e.g. consumer bug, unexpected payload shape),
   * the subStatus / details branches MUST still run. This catches the
   * real-world failure mode where a subtle exception in the
   * metadata_update merge logic silently kills the rest of the handler
   * and leaves the terminal stuck on "Initializing...".
   */
  it('still appends desktopLogs even when setVideoData throws', () => {
    const desktopLogsCalls: Array<unknown> = [];

    handleSseMessage(
      {
        metadata_update: { title: 'X', formats: [] },
        subStatus: 'Decrypting streams...',
        details: 'PROCESS: SPAWNING_YTDLP_FALLBACK',
      },
      '',
      {
        setStatus: vi.fn(),
        setVideoData: () => {
          throw new Error('boom: simulated consumer crash');
        },
        setIsPickerOpen: vi.fn(),
        setPendingSubStatuses: vi.fn(),
        setDesktopLogs: (updater) => {
          desktopLogsCalls.push(updater);
        },
        setTargetProgress: vi.fn(),
        setProgress: vi.fn(),
        setSubStatus: vi.fn(),
        getTS: () => '[0:01]',
      }
    );

    // subStatus branch still runs despite the throw; paired details is dropped
    expect(desktopLogsCalls).toHaveLength(1);
  });

  it('still processes subStatus even when setIsPickerOpen throws', () => {
    const desktopLogsCalls: Array<unknown> = [];

    handleSseMessage(
      {
        metadata_update: { title: 'Y', formats: [] },
        subStatus: 'Quality resolution complete.',
      },
      '',
      {
        setStatus: vi.fn(),
        setVideoData: vi.fn(),
        setIsPickerOpen: () => {
          throw new Error('boom: picker open crash');
        },
        setPendingSubStatuses: vi.fn(),
        setDesktopLogs: (updater) => {
          desktopLogsCalls.push(updater);
        },
        setTargetProgress: vi.fn(),
        setProgress: vi.fn(),
        setSubStatus: vi.fn(),
        getTS: () => '[0:01]',
      }
    );

    expect(desktopLogsCalls).toHaveLength(1);
  });
});

describe('handleSseMessage — JSON blob in details is filtered from desktop logs', () => {
  /**
   * Regression: the early-hit dispatch in extractors/index.ts shoves the
   * raw early_metadata payload into details as a JSON string. The
   * frontend used to push that JSON straight into the desktop log
   * stream, polluting the terminal view with unreadable
   * {"early_metadata":...} blobs.
   *
   * The fix has two layers:
   *   - backend strips details once it lifts the payload into
   *     metadata_update (see info.ts:reportProgress)
   *   - frontend defensively skips JSON-shaped details strings
   *
   * This test pins the frontend layer.
   */
  function dispatchDetails(details: string) {
    const desktopLogsCalls: Array<unknown> = [];

    handleSseMessage({ details }, 'https://www.youtube.com/watch?v=x', {
      setStatus: vi.fn(),
      setVideoData: vi.fn(),
      setIsPickerOpen: vi.fn(),
      setPendingSubStatuses: vi.fn(),
      setDesktopLogs: (updater: unknown) => {
        desktopLogsCalls.push(updater);
      },
      setTargetProgress: vi.fn(),
      setProgress: vi.fn(),
      setSubStatus: vi.fn(),
      getTS: () => '[0:01]',
    });

    return desktopLogsCalls;
  }

  it('drops details that look like an early_metadata JSON blob', () => {
    const blob = JSON.stringify({
      early_metadata: { title: 'X', artist: 'Y', formats: [] },
    });
    expect(dispatchDetails(blob)).toHaveLength(0);
  });

  it('drops any object-shaped JSON details (defensive)', () => {
    const blob = '{"foo":"bar","nested":{"a":1}}';
    expect(dispatchDetails(blob)).toHaveLength(0);
  });

  it('still appends regular human-readable details', () => {
    expect(dispatchDetails('PROCESS: SPAWNING_YTDLP_FALLBACK')).toHaveLength(1);
    expect(dispatchDetails('NETWORK: RESOLVING_REDIRECTS')).toHaveLength(1);
  });
});

describe('handleSseMessage — guards against silent failure modes', () => {
  it('does not throw if details is the early_metadata JSON blob', () => {
    const { state, dispatch } = runWithRecordedState();

    expect(() =>
      dispatch({
        subStatus: 'Metadata found',
        details: JSON.stringify({
          early_metadata: { title: 'X', artist: 'Y', formats: [] },
        }),
      })
    ).not.toThrow();

    /**
     * Two appends would be unsafe — the JSON details must be filtered.
     * One append (for subStatus) is the correct count.
     */
    expect(state.desktopLogs).toHaveLength(2);
  });

  it('does not crash when getTS is not provided (defensive)', () => {
    const setDesktopLogs = vi.fn();
    expect(() =>
      handleSseMessage({ subStatus: 'hello' }, 'url', {
        setStatus: vi.fn(),
        setVideoData: vi.fn(),
        setIsPickerOpen: vi.fn(),
        setPendingSubStatuses: vi.fn(),
        setDesktopLogs,
        setTargetProgress: vi.fn(),
        setProgress: vi.fn(),
        setSubStatus: vi.fn(),
        getTS: undefined as unknown as () => string,
      })
    ).not.toThrow();
  });
});

/**
 * End-to-end integration test with the real Zustand store + the exact
 * wrapper pattern App.tsx uses. This catches regressions where the
 * wrapper accidentally drops the function-updater (e.g. if someone
 * swaps `useAppStore.getState().setDesktopLogs(payload)` for
 * `setDesktopLogs([...payload])` or similar). Without this, the unit
 * tests above could pass while the actual app silently shows only the
 * "Initializing..." line forever.
 */
describe('handleSseMessage — App.tsx wrapper integration', () => {
  it('appends to the real Zustand store via the wrapper', async () => {
    const { useAppStore } = await import('../src/store/useAppStore');
    useAppStore.setState({
      desktopLogs: ['[0:00] Initializing Phantom Core Engine...'],
      pendingSubStatuses: [],
      subStatus: '',
      sessionStartTime: Date.now(),
    } as unknown as Parameters<typeof useAppStore.setState>[0]);

    // App wrapper shape
    const wrapper = {
      setStatus: (s: string) => useAppStore.getState().setStatus(s),
      setVideoData: (v: unknown) =>
        useAppStore
          .getState()
          .setVideoData(
            v as Parameters<typeof useAppStore.getState>[0] extends never
              ? never
              : Parameters<
                  ReturnType<typeof useAppStore.getState>['setVideoData']
                >[0]
          ),
      setIsPickerOpen: (o: boolean) =>
        useAppStore.getState().setIsPickerOpen(o),
      setPendingSubStatuses: (payload: unknown) =>
        useAppStore.getState().setPendingSubStatuses(payload as string[]),
      setDesktopLogs: (payload: unknown) =>
        useAppStore.getState().setDesktopLogs(payload as string[]),
      setTargetProgress: (tp: unknown) =>
        useAppStore.getState().setTargetProgress(tp as number),
      setProgress: (progress: unknown) =>
        useAppStore.getState().setProgress(progress as number),
      setSubStatus: (ss: string) => useAppStore.getState().setSubStatus(ss),
      getTS: () => '[0:01]',
    };

    handleSseMessage({ subStatus: 'Decrypting streams...' }, '', wrapper);
    handleSseMessage({ subStatus: 'Metadata parsed' }, '', wrapper);
    handleSseMessage(
      {
        details: 'PROCESS: SPAWNING_YTDLP_FALLBACK',
      },
      '',
      wrapper
    );

    const finalLogs = useAppStore.getState().desktopLogs;
    expect(finalLogs).toHaveLength(4);
    expect(finalLogs[1]).toContain('Decrypting streams');
    expect(finalLogs[2]).toContain('Metadata parsed');
    expect(finalLogs[3]).toContain('SPAWNING_YTDLP_FALLBACK');
  });
});
