import { describe, it, expect } from 'vitest';
import { getFpsBadgeLabel } from '../src/components/modals/SharedComponents';

/**
 * regression: audio formats carry fps 0, and `{fps && <Badge/>}` rendered
 * a literal "0" next to "133kbps". the label must be null for falsy fps.
 */
describe('getFpsBadgeLabel', () => {
  it('returns null for audio fps 0 (no stray "0")', () => {
    expect(getFpsBadgeLabel(0)).toBeNull();
  });

  it('returns null for undefined fps', () => {
    expect(getFpsBadgeLabel()).toBeNull();
  });

  it('keeps FAST badge for synthetic option', () => {
    expect(getFpsBadgeLabel('FAST')).toBe('FAST');
  });

  it('formats real fps with suffix', () => {
    expect(getFpsBadgeLabel(30)).toBe('30fps');
    expect(getFpsBadgeLabel(60, ' FPS')).toBe('60 FPS');
  });
});
