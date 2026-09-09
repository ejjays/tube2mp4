import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordEmeAttempt,
  recordEmeOutcome,
  getEmeStats,
} from '../src/lib/emeTelemetry';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('eme telemetry', () => {
  it('starts empty', () => {
    expect(getEmeStats()).toMatchObject({
      attempts: 0,
      successes: 0,
      failures: 0,
      skips: 0,
    });
  });

  it('counts an attempt and a success', () => {
    recordEmeAttempt();
    recordEmeOutcome('success');
    const stats = getEmeStats();
    expect(stats.attempts).toBe(1);
    expect(stats.successes).toBe(1);
    expect(stats.failures).toBe(0);
  });

  it('records a failure with its reason', () => {
    recordEmeAttempt();
    recordEmeOutcome('failure', 'oom');
    const stats = getEmeStats();
    expect(stats.failures).toBe(1);
    expect(stats.lastReason).toBe('oom');
  });

  it('tracks skips separately from failures', () => {
    recordEmeAttempt();
    recordEmeOutcome('skip', 'no_separate_streams');
    const stats = getEmeStats();
    expect(stats.skips).toBe(1);
    expect(stats.failures).toBe(0);
  });

  it('persists cumulatively across calls', () => {
    recordEmeAttempt();
    recordEmeOutcome('success');
    recordEmeAttempt();
    recordEmeOutcome('failure', 'network');
    const stats = getEmeStats();
    expect(stats.attempts).toBe(2);
    expect(stats.successes).toBe(1);
    expect(stats.failures).toBe(1);
  });
});
