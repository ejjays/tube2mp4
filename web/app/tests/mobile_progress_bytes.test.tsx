import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MobileProgress from '../src/components/MobileProgress';
import { useAppStore } from '../src/store/useAppStore';

const MB = 1000 * 1000;

const seed = (patch: Record<string, unknown>) =>
  useAppStore.setState({
    loading: true,
    progress: 50,
    status: 'eme_downloading',
    emePhase: 'download',
    emeProgress: 50,
    emeBytes: null,
    subStatus: '',
    videoTitle: 'Clip',
    selectedFormat: 'mp4',
    error: '',
    ...patch,
  } as Partial<ReturnType<typeof useAppStore.getState>>);

describe('MobileProgress — live byte readout', () => {
  beforeEach(() => {
    cleanup();
  });

  it('shows received / total during the download phase', () => {
    seed({
      status: 'eme_downloading',
      emePhase: 'download',
      emeBytes: { received: 350 * MB, total: 700 * MB },
    });
    render(<MobileProgress />);
    expect(screen.getByText(/350\.0 MB/)).toBeTruthy();
    expect(screen.getByText(/700\.0 MB/)).toBeTruthy();
  });

  it('hides the byte readout during the mux phase', () => {
    seed({
      status: 'eme_muxing',
      emePhase: 'mux',
      emeBytes: { received: 700 * MB, total: 700 * MB },
    });
    render(<MobileProgress />);
    expect(screen.queryByText(/700\.0 MB/)).toBeNull();
  });

  it('hides the byte readout when total is unknown', () => {
    seed({
      status: 'eme_downloading',
      emePhase: 'download',
      emeBytes: { received: 10 * MB, total: 0 },
    });
    render(<MobileProgress />);
    expect(screen.queryByText(/MB/)).toBeNull();
  });
});
