#!/usr/bin/env node
// pure node test: low memory usage
// runs in <100MB, won't kill termux

import assert from 'node:assert/strict';
import tls from 'node:tls';
import { test } from 'node:test';
import {
  randomizeCiphers,
  startCipherRotation,
} from '../../dist/api/src/utils/network/cipher.util.js';

const ORIGINAL = tls.DEFAULT_CIPHERS;

test('cipher: changes order on each call', () => {
  randomizeCiphers();
  const first = tls.DEFAULT_CIPHERS;
  randomizeCiphers();
  const second = tls.DEFAULT_CIPHERS;
  assert.notEqual(first, ORIGINAL);
  assert.notEqual(second, first);
  tls.DEFAULT_CIPHERS = ORIGINAL;
});

test('cipher: preserves count', () => {
  randomizeCiphers();
  assert.equal(
    tls.DEFAULT_CIPHERS.split(':').length,
    ORIGINAL.split(':').length
  );
  tls.DEFAULT_CIPHERS = ORIGINAL;
});

test('cipher: only top 8 shuffled', () => {
  randomizeCiphers();
  const after = tls.DEFAULT_CIPHERS.split(':');
  const before = ORIGINAL.split(':');
  assert.deepEqual(after.slice(8), before.slice(8));
  tls.DEFAULT_CIPHERS = ORIGINAL;
});

test('cipher: top 8 has same items', () => {
  randomizeCiphers();
  const sortedAfter = tls.DEFAULT_CIPHERS.split(':').slice(0, 8).sort();
  const sortedBefore = ORIGINAL.split(':').slice(0, 8).sort();
  assert.deepEqual(sortedAfter, sortedBefore);
  tls.DEFAULT_CIPHERS = ORIGINAL;
});

test('cipher: startCipherRotation applies immediately', () => {
  startCipherRotation();
  assert.notEqual(tls.DEFAULT_CIPHERS, ORIGINAL);
  tls.DEFAULT_CIPHERS = ORIGINAL;
});
