// EAS copies the project into its own sandbox and installs there, so any
// dist/ built on the CI runner is discarded. Build the workspace packages
// from inside the sandbox instead, before Metro resolves them.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

// only what mobile actually imports; @phantom/web-mux is server-side
const PACKAGES = ['packages/extractors'];

let failed = false;
for (const pkg of PACKAGES) {
  const dir = join(repoRoot, pkg);
  if (!existsSync(join(dir, 'package.json'))) continue;

  console.log(`[build-internal-packages] building ${pkg}`);
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`[build-internal-packages] build failed for ${pkg}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
