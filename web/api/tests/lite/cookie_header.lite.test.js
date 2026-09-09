#!/usr/bin/env node
// pure node test for cookie headers
import assert from 'node:assert/strict';
import { test } from 'node:test';

// extract pure logic from bootstrapCookies for testing
function fixHeader(text) {
  if (!text.startsWith('# Netscape HTTP Cookie File')) {
    return text.replace(/^#[^\n]*\n/, '# Netscape HTTP Cookie File\n');
  }
  return text;
}

test('cookie header: rewrites NEW COKKIE typo', () => {
  const input =
    '# Netscape NEW COKKIE\n.youtube.com\tTRUE\t/\tTRUE\t1814\tPREF\tx\n';
  const output = fixHeader(input);
  assert.equal(output.split('\n')[0], '# Netscape HTTP Cookie File');
  assert.ok(!output.includes('NEW COKKIE'));
});

test('cookie header: preserves valid header', () => {
  const input =
    '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1814\tPREF\tx\n';
  const output = fixHeader(input);
  assert.equal(output, input);
});

test('cookie header: preserves cookie data after rewrite', () => {
  const input =
    '# Netscape NEW COKKIE\n.youtube.com\tTRUE\t/\tTRUE\t1814\tPREF\tx\n';
  const output = fixHeader(input);
  assert.match(output, /\.youtube\.com/u);
  assert.ok(output.includes('PREF'));
});
