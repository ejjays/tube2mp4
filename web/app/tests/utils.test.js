import { describe, it, expect } from 'vitest';
import { formatSize, getQualityLabel, cn } from '../src/lib/utils';

describe('Frontend Utils', () => {
  describe('formatSize', () => {
    it('should format bytes to KB', () => {
      expect(formatSize(1000)).toBe('1 KB');
    });

    it('should format bytes to MB', () => {
      expect(formatSize(1000 * 1000)).toBe('1.0 MB');
    });

    it('should format bytes to GB', () => {
      expect(formatSize(1000 * 1000 * 1000)).toBe('1.00 GB');
    });

    it('should return Unknown size for null/undefined', () => {
      expect(formatSize(null)).toBe('Unknown size');
    });
  });

  describe('getQualityLabel', () => {
    it('should identify 4K', () => {
      expect(getQualityLabel('2160p (4K)')).toBe('4K');
    });

    it('should strip Original Master', () => {
      expect(getQualityLabel('1080p (Original Master)')).toBe('1080p');
    });
  });

  describe('cn (Tailwind Merge)', () => {
    it('should merge classes correctly', () => {
      expect(cn('px-2', 'px-4')).toBe('px-4');
    });
  });
});
