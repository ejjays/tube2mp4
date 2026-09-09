import { describe, it, expect } from 'vitest';
import {
  decode,
  decodeHtmlEntities,
} from '../../src/services/extractors/facebook/utils.js';

describe('facebook decodeHtmlEntities', () => {
  it('decodes hex, decimal, and named entities together', () => {
    expect(
      decodeHtmlEntities('Tom &amp; Jerry&#x27;s &quot;quote&quot; &lt;ok&gt;')
    ).toBe('Tom & Jerry\'s "quote" <ok>');
  });

  it('decodes multi-byte hex codepoints', () => {
    expect(decodeHtmlEntities('clap &#x1F44F; now')).toBe('clap 👏 now');
  });

  it('decodes decimal apostrophe variants', () => {
    expect(decodeHtmlEntities('it&#39;s and it&#039;s')).toBe("it's and it's");
  });

  it('leaves plain text untouched', () => {
    expect(decodeHtmlEntities('no entities here')).toBe('no entities here');
  });
});

describe('facebook decode (json-in-html capture)', () => {
  it('unwraps a fully quoted json string', () => {
    expect(decode('"hello world"')).toBe('hello world');
  });

  it('unescapes forward slashes in cdn urls', () => {
    expect(decode('https:\\/\\/video.fbcdn.net\\/v\\/x.mp4')).toBe(
      'https://video.fbcdn.net/v/x.mp4'
    );
  });

  it('decodes unicode escape sequences', () => {
    expect(decode('caf\\u00e9 r\\u00e9sum\\u00e9')).toBe('café résumé');
  });

  // regression: decode now also handles numeric entities
  it('decodes numeric html entities via the shared decoder', () => {
    expect(decode('x &#x27;y&#x27; &amp; z')).toBe("x 'y' & z");
  });

  it('falls back to a lenient strip when json parsing throws', () => {
    // invalid json hits the catch path
    expect(decode('"a"&amp;"b"')).toBe('"a"&"b"');
  });
});
