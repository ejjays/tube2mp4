import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSseMessage } from '../src/hooks/useSSE';
import { useAppStore } from '../src/store/useAppStore';

// regression: background SSE must not clobber client-mux status

const makeActions = (
  setStatus: ReturnType<typeof vi.fn>,
  setTargetProgress: ReturnType<typeof vi.fn>
) => ({
  setStatus,
  setVideoData: vi.fn(),
  setIsPickerOpen: vi.fn(),
  setPendingSubStatuses: vi.fn(),
  setDesktopLogs: vi.fn(),
  setTargetProgress,
  setProgress: vi.fn(),
  setSubStatus: vi.fn(),
  getTS: () => '[0:01]',
});

const URL = 'https://www.youtube.com/watch?v=test';

describe('SSE never clobbers the client-mux (eme_) status', () => {
  beforeEach(() => {
    useAppStore.getState().setStatus('idle');
  });

  it('ignores a non-eme SSE status while eme is active', () => {
    useAppStore.getState().setStatus('eme_downloading');
    const setStatus = vi.fn();
    handleSseMessage(
      { status: 'extracting' },
      URL,
      makeActions(setStatus, vi.fn())
    );
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('still applies an eme phase transition', () => {
    useAppStore.getState().setStatus('eme_downloading');
    const setStatus = vi.fn();
    handleSseMessage(
      { status: 'eme_muxing' },
      URL,
      makeActions(setStatus, vi.fn())
    );
    expect(setStatus).toHaveBeenCalledWith('eme_muxing');
  });

  it('applies server status normally when not in eme', () => {
    useAppStore.getState().setStatus('initializing');
    const setStatus = vi.fn();
    handleSseMessage(
      { status: 'downloading' },
      URL,
      makeActions(setStatus, vi.fn())
    );
    expect(setStatus).toHaveBeenCalledWith('downloading');
  });

  it('ignores sse progress while eme is active', () => {
    useAppStore.getState().setStatus('eme_downloading');
    const setTargetProgress = vi.fn();
    handleSseMessage(
      { progress: 80 },
      URL,
      makeActions(vi.fn(), setTargetProgress)
    );
    expect(setTargetProgress).not.toHaveBeenCalled();
  });
});
