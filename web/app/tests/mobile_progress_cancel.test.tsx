import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MobileProgress from '../src/components/MobileProgress';
import { useAppStore } from '../src/store/useAppStore';

const seed = (patch: Record<string, unknown>) =>
  useAppStore.setState({
    loading: true,
    progress: 42,
    emeProgress: 42,
    emePhase: 'mux',
    status: 'eme_muxing',
    subStatus: 'Muxing 42%',
    videoTitle: 'Clip',
    selectedFormat: 'mp4',
    error: '',
    ...patch,
  } as Partial<ReturnType<typeof useAppStore.getState>>);

describe('MobileProgress — cancel button', () => {
  beforeEach(() => {
    cleanup();
  });

  it('shows Cancel during an on-device phase and calls onCancel when clicked', () => {
    const onCancel = vi.fn();
    seed({ status: 'eme_muxing', emePhase: 'mux' });
    render(<MobileProgress onCancel={onCancel} />);

    const btn = screen.getByRole('button', { name: /cancel on-device/i });
    fireEvent.click(btn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('hides Cancel when no on-device phase is active', () => {
    seed({ status: 'downloading', emePhase: null });
    render(<MobileProgress onCancel={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: /cancel on-device/i })
    ).toBeNull();
  });

  it('does not render a Cancel button when onCancel is omitted', () => {
    seed({ status: 'eme_muxing', emePhase: 'mux' });
    render(<MobileProgress />);

    expect(
      screen.queryByRole('button', { name: /cancel on-device/i })
    ).toBeNull();
  });
});
