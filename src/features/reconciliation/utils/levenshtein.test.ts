/**
 * Levenshtein distance and normalized similarity tests.
 */
import { describe, it, expect } from 'vitest';
import { levenshteinDistance, normalizedSimilarity } from './levenshtein';

describe('levenshtein', () => {
  describe('9. Identical strings', () => {
    it('should return distance 0 and similarity 1.0 for identical strings', () => {
      const s = 'hello world';
      expect(levenshteinDistance(s, s)).toBe(0);
      expect(normalizedSimilarity(s, s)).toBe(1);
    });
  });

  describe('10. One character difference', () => {
    it('should return distance 1 for "cat" vs "car"', () => {
      expect(levenshteinDistance('cat', 'car')).toBe(1);
    });
  });

  describe('11. Empty strings', () => {
    it('should return distance 0 when both strings are empty', () => {
      expect(levenshteinDistance('', '')).toBe(0);
      expect(normalizedSimilarity('', '')).toBe(1); // identical (both empty) → 1
    });
  });

  describe('12. One empty, one not', () => {
    it('should return distance 5 for "" vs "hello"', () => {
      expect(levenshteinDistance('', 'hello')).toBe(5);
    });
  });

  describe('13. normalizedSimilarity calculation', () => {
    it('should return reasonable similarity for "Johnson" vs "Jonson"', () => {
      const sim = normalizedSimilarity('Johnson', 'Jonson');
      expect(sim).toBeGreaterThanOrEqual(0.7);
      expect(sim).toBeLessThanOrEqual(0.95);
    });
  });

  describe('14. Very different strings', () => {
    it('should return low similarity for "Apple" vs "Zebra"', () => {
      const sim = normalizedSimilarity('Apple', 'Zebra');
      expect(sim).toBeLessThan(0.3);
    });
  });
});
