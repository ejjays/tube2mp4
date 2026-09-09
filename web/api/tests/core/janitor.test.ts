import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupLocalTemp } from '../../src/utils/infra/janitor.util.js';

describe('cleanupLocalTemp', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-janitor-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('removes stale files but keeps fresh ones', async () => {
    const oldFile = path.join(dir, 'old.tmp');
    const newFile = path.join(dir, 'new.tmp');
    fs.writeFileSync(oldFile, 'x');
    fs.writeFileSync(newFile, 'y');
    // age the old file two hours
    const twoHoursAgo = Date.now() - 2 * 3600000;
    fs.utimesSync(oldFile, new Date(twoHoursAgo), new Date(twoHoursAgo));

    await cleanupLocalTemp(dir, 3600000);

    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(newFile)).toBe(true);
  });

  it('no-ops on a missing directory', async () => {
    await expect(
      cleanupLocalTemp(path.join(dir, 'nope'))
    ).resolves.toBeUndefined();
  });
});


