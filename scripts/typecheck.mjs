#!/usr/bin/env node
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { join } from 'node:path';
import process from 'node:process';

// tsc runs via node (termux shebangs); tsgo under proot on android — kernel kills its fanotify probe
const WORKSPACES = [
  'web/api',
  'web/app',
  'mobile',
  'packages/extractors',
  'packages/web-mux',
];

const root = path.resolve(import.meta.dirname, '..');

function resolveCompiler(dir) {
  const require = createRequire(path.join(dir, 'package.json'));
  let bin, tag;
  let prefix = [];
  try {
    // ts7 exports map hides bin/, so anchor on package.json (always exported)
    const pkgDir = path.dirname(require.resolve('typescript7/package.json'));
    bin = join(pkgDir, 'bin', 'tsc');
    const version = require('typescript7/package.json').version;
    if (process.platform === 'android') {
      prefix = ['proot'];
      tag = `ts ${version} tsgo/proot`;
    } else {
      tag = `ts ${version} tsgo`;
    }
  } catch {
    try {
      bin = require.resolve('typescript/bin/tsc');
      tag = `ts ${require('typescript/package.json').version}`;
    } catch {
      return null;
    }
  }
  return { bin, tag, prefix };
}

function runCompiler(dir, compiler) {
  const args = [
    ...(compiler.prefix.length ? [...compiler.prefix] : []),
    process.execPath,
    compiler.bin,
    '--noEmit',
    '-p',
    dir,
  ];
  const cmd = args.shift();
  return spawnSync(cmd, args, { encoding: 'utf8' });
}

const rootDir = path.resolve(import.meta.dirname, '..');
let failed = 0;

for (const ws of WORKSPACES) {
  const dir = path.join(rootDir, ws);
  const compiler = resolveCompiler(dir);
  if (!compiler) {
    console.error(`✗ ${ws}: no typescript installed`);
    failed++;
    continue;
  }

  let r = runCompiler(dir, compiler);
  let usedTag = compiler.tag;

  if (r.error || r.signal) {
    const fallback = resolveClassic(dir);
    if (fallback) {
      r = runCompiler(dir, fallback);
      usedTag = fallback.tag;
    }
  }

  if (r.status !== 0) {
    console.error(`✗ ${ws} (${usedTag})`);
    if (r.stdout) console.error(r.stdout);
    if (r.stderr) console.error(r.stderr);
    failed++;
  } else {
    console.log(`✓ ${ws} (${usedTag})`);
  }
}

function resolveClassic(dir) {
  const require = createRequire(path.join(dir, 'package.json'));
  try {
    return {
      bin: require.resolve('typescript/bin/tsc'),
      tag: `ts ${require('typescript/package.json').version}`,
      prefix: [],
    };
  } catch {
    return null;
  }
}

if (failed) {
  console.error(`✅✗ typecheck: ${failed} workspace(s) failed`);
  process.exit(1);
}
console.log('✅ typecheck passed (all workspaces)');
