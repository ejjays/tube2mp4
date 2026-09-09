import { describe, it, expect } from 'vitest';
import { getInitialOptions } from '../src/components/modals/StandardQualityPicker';
import { tagOriginalMaster } from '../src/components/modals/SharedComponents';

/**
 * regression: spotify picker showed "No formats found" with empty
 * audioFormats. synthetic mp3 was gated behind currentOptions.length > 0,
 * so the universal mp3 fallback never appeared on the standard picker.
 */
describe('getInitialOptions', () => {
  it('synthesizes a 192kbps mp3 when audioFormats is empty', () => {
    const options = getInitialOptions('mp3', {
      audioFormats: [],
      duration: 200,
    });
    expect(options).toHaveLength(1);
    expect(options[0].formatId).toBe('mp3_synthetic');
    expect(options[0].quality).toBe('192kbps');
    expect(options[0].fps).toBeUndefined();
  });

  it('puts m4a (Original Master) first and appends synthetic mp3', () => {
    const options = getInitialOptions('mp3', {
      audioFormats: [{ formatId: '140', ext: 'm4a', quality: '130kbps' }],
    });
    expect(options).toHaveLength(2);
    expect(options[0].quality).toBe('130kbps (Original Master)');
    expect(options[1].formatId).toBe('mp3_synthetic');
  });

  it('does not synthesize for empty mp4 video formats', () => {
    expect(getInitialOptions('mp4', { formats: [] })).toEqual([]);
  });
});

describe('tagOriginalMaster', () => {
  it('tags only m4a and is idempotent', () => {
    const once = tagOriginalMaster([
      { ext: 'm4a', quality: '130kbps' },
      { ext: 'mp3', quality: '192kbps' },
    ]);
    expect(once[0].quality).toBe('130kbps (Original Master)');
    expect(once[1].quality).toBe('192kbps');
    expect(tagOriginalMaster(once)[0].quality).toBe(
      '130kbps (Original Master)'
    );
  });
});
