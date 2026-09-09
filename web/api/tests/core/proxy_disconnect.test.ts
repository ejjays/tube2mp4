import { describe, it, expect } from 'vitest';
import { isBenignDisconnect } from '../../src/utils/network/proxy.util.js';

const withCode = (message: string, code: string): Error => {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
};

describe('isBenignDisconnect', () => {
  it('treats an AbortError as benign', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(isBenignDisconnect(err)).toBe(true);
  });

  it('treats ERR_STREAM_PREMATURE_CLOSE code as benign', () => {
    expect(
      isBenignDisconnect(
        withCode('Premature close', 'ERR_STREAM_PREMATURE_CLOSE')
      )
    ).toBe(true);
  });

  it('treats a Premature close message as benign', () => {
    expect(isBenignDisconnect(new Error('Premature close'))).toBe(true);
  });

  it('does not treat a real upstream error as benign', () => {
    expect(isBenignDisconnect(new Error('HTTP 500'))).toBe(false);
    expect(isBenignDisconnect(withCode('socket hang up', 'ECONNRESET'))).toBe(
      false
    );
  });
});
