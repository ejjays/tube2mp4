import { describe, it, expect } from 'vitest';
import { parseUniversalData } from '@phantom/extractors';

const rehydration = (itemStruct: unknown): string =>
  `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(
    {
      __DEFAULT_SCOPE__: {
        'webapp.video-detail': { itemInfo: { itemStruct } },
      },
    }
  )}</script>`;

describe('parseUniversalData', () => {
  it('extracts the item struct from the rehydration script', () => {
    const html = rehydration({
      id: '123',
      desc: 'a tiktok',
      author: { uniqueId: 'user', nickname: 'User' },
    });

    const item = parseUniversalData(html);
    expect(item?.id).toBe('123');
    expect(item?.desc).toBe('a tiktok');
    expect(item?.author?.nickname).toBe('User');
  });

  it('returns null without the rehydration marker', () => {
    expect(parseUniversalData('<html>no data</html>')).toBeNull();
  });

  it('returns null on malformed json', () => {
    const html =
      '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{ not json }</script>';
    expect(parseUniversalData(html)).toBeNull();
  });
});
