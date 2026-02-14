/**
 * Numeric tolerance utility tests.
 * Tests getMaxFixedTolerance: 1% of max absolute value in columns, minimum 100.
 */
import { describe, it, expect } from 'vitest';
import { getMaxFixedTolerance } from './numericToleranceUtils';
import type { RawCsvRow } from '@/features/reconciliation/types';

describe('numericToleranceUtils', () => {
  describe('15. Fixed tolerance — large values', () => {
    it('should return 1% of max when max is large (e.g. 10000 → 100)', () => {
      const rowsA: RawCsvRow[] = [{ Amount: '10000' }, { Amount: '5000' }];
      const rowsB: RawCsvRow[] = [{ Amount: '3000' }];
      const result = getMaxFixedTolerance(rowsA, rowsB, 'Amount', 'Amount');
      expect(result).toBe(100); // 1% of 10000 = 100
    });
  });

  describe('16. Fixed tolerance — minimum floor', () => {
    it('should return at least 100 when 1% is smaller (e.g. max 1000 → 100)', () => {
      const rowsA: RawCsvRow[] = [{ Amount: '1000' }];
      const rowsB: RawCsvRow[] = [{ Amount: '500' }];
      const result = getMaxFixedTolerance(rowsA, rowsB, 'Amount', 'Amount');
      expect(result).toBe(100); // 1% of 1000 = 10, but min is 100
    });
  });

  describe('17. Percentage tolerance — large max', () => {
    it('should return 1% of max for 100000 (→ 1000)', () => {
      const rowsA: RawCsvRow[] = [{ Amount: '100000' }];
      const rowsB: RawCsvRow[] = [{ Amount: '50000' }];
      const result = getMaxFixedTolerance(rowsA, rowsB, 'Amount', 'Amount');
      expect(result).toBe(1000); // 1% of 100000 = 1000
    });
  });

  describe('18. Empty rows', () => {
    it('should return minimum 100 when no numeric values', () => {
      const rowsA: RawCsvRow[] = [];
      const rowsB: RawCsvRow[] = [];
      const result = getMaxFixedTolerance(rowsA, rowsB, 'Amount', 'Amount');
      expect(result).toBe(100);
    });
  });
});
