import { vi } from 'vitest';
import { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

export function createMockChildProcess(
  overrides?: Partial<ChildProcess>
): ChildProcess {
  const mockProcess = new EventEmitter() as unknown as Record<string, unknown>;

  mockProcess.stdout = new PassThrough();
  mockProcess.stderr = new PassThrough();
  mockProcess.stdin = new PassThrough();
  mockProcess.kill = vi.fn();
  mockProcess.pid = 12345;
  mockProcess.connected = true;
  mockProcess.killed = false;
  mockProcess.exitCode = null;
  mockProcess.signalCode = null;
  mockProcess.spawnargs = [];
  mockProcess.spawnfile = '';

  Object.assign(mockProcess, overrides);

  return mockProcess as unknown as ChildProcess;
}
