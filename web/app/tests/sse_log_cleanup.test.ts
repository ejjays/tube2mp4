import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleSseMessage } from '../src/hooks/useSSE';
import { useAppStore } from '../src/store/useAppStore';

// regression: terminal logs dedup by text and drop paired details

const makeHarness = () => {
  let logs: string[] = [];
  let timestamp = '[0:00]';
  const actions = {
    setStatus: vi.fn(),
    setVideoData: vi.fn(),
    setIsPickerOpen: vi.fn(),
    setPendingSubStatuses: vi.fn(),
    setDesktopLogs: (updater: string[] | ((prev: string[]) => string[])) => {
      logs = typeof updater === 'function' ? updater(logs) : updater;
    },
    setTargetProgress: vi.fn(),
    setProgress: vi.fn(),
    setSubStatus: vi.fn(),
    getTS: () => timestamp,
  };
  return {
    actions,
    getLogs: () => logs,
    setTimestamp: (next: string) => {
      timestamp = next;
    },
  };
};

const URL = 'https://www.youtube.com/watch?v=test';

describe('terminal log cleanup', () => {
  beforeEach(() => {
    useAppStore.getState().setStatus('initializing');
  });

  it('drops a details code when paired with a subStatus', () => {
    const { actions, getLogs } = makeHarness();
    handleSseMessage(
      {
        subStatus: 'Bypassing restricted clients...',
        details: 'AUTH: BYPASSING_PROTOCOL_RESTRICTIONS',
      },
      URL,
      actions
    );
    expect(getLogs()).toEqual(['[0:00] Bypassing restricted clients...']);
  });

  it('keeps a standalone details line', () => {
    const { actions, getLogs } = makeHarness();
    handleSseMessage({ details: 'ISRC_IDENTIFIED: USRC12345' }, URL, actions);
    expect(getLogs()).toEqual(['[0:00] ISRC_IDENTIFIED: USRC12345']);
  });

  it('dedups the same text across different timestamps', () => {
    const { actions, getLogs, setTimestamp } = makeHarness();
    handleSseMessage({ subStatus: 'Initializing Session...' }, URL, actions);
    setTimestamp('[0:01]');
    handleSseMessage({ subStatus: 'Initializing Session...' }, URL, actions);
    expect(getLogs()).toEqual(['[0:00] Initializing Session...']);
  });
});
