import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getInfo,
  getStream,
} from '../../src/services/extractors/facebook/index.js';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { CaseSchema } from '../utils/schema.js';
import { assertOutcome } from '../utils/assert.js';
import rawCases from '../fixtures/extractors/facebook.json';

const testCases = z.array(CaseSchema).parse(rawCases);

describe('Facebook JS Extractor (Data-Driven)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(testCases)('should extract metadata for $name', async (testCase) => {
    const info = await getInfo(testCase.url);
    assertOutcome(info, testCase.expected);

    if (
      testCase.expected.status === 'ok' &&
      testCase.expected.type === 'video'
    ) {
      expect(info?.formats?.length).toBeGreaterThan(0);
    }
  });

  it('should be able to initiate a stream (Pure JS Stream)', async () => {
    const testCase = testCases[0];
    const info = await getInfo(testCase.url);
    if (!info) throw new Error('Info extraction failed');

    const formatId = info.formats[0].formatId;
    const stream = await getStream(info, { formatId });

    expect(stream).toBeInstanceOf(Readable);
    stream.destroy();
  });
});
