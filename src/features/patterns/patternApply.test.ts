/**
 * Pattern apply unit tests.
 * Mocks @/lib/database to avoid real Supabase calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  enhanceSuggestedRules,
  getLearnedVendorMappings,
} from './patternApply';
import type { MatchingRule } from '@/features/reconciliation/types';

vi.mock('@/lib/database', () => ({
  getColumnPairPreferences: vi.fn(),
  getVendorMappings: vi.fn(),
  getPatterns: vi.fn().mockResolvedValue([]),
}));

import { getColumnPairPreferences, getVendorMappings } from '@/lib/database';

function rule(overrides: Partial<MatchingRule>): MatchingRule {
  return {
    id: 'r1',
    columnA: 'Amount',
    columnB: 'Total',
    matchType: 'tolerance_numeric',
    weight: 0.5,
    ...overrides,
  };
}

describe('patternApply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('5. enhanceSuggestedRules with no patterns → rules unchanged', () => {
    it('should return rules unchanged and influenced=false when no patterns', async () => {
      vi.mocked(getColumnPairPreferences).mockResolvedValue([]);
      const suggested: MatchingRule[] = [
        rule({ columnA: 'Amount', columnB: 'Total' }),
        rule({ id: 'r2', columnA: 'Reference', columnB: 'RefNo' }),
      ];

      const result = await enhanceSuggestedRules('org-123', suggested, ['Amount', 'Reference'], ['Total', 'RefNo']);

      expect(result.influenced).toBe(false);
      expect(result.rules).toHaveLength(2);
      expect(result.rules[0]!.learned).toBeUndefined();
      expect(result.rules[1]!.learned).toBeUndefined();
    });
  });

  describe('6. enhanceSuggestedRules with matching pattern → adds learned badge', () => {
    it('should set learned: true when column pair has preference', async () => {
      vi.mocked(getColumnPairPreferences).mockResolvedValue([
        { columnA: 'Amount', columnB: 'Total', frequency: 3, context: {} },
      ]);
      const suggested: MatchingRule[] = [
        rule({ columnA: 'Amount', columnB: 'Total' }),
        rule({ id: 'r2', columnA: 'Reference', columnB: 'RefNo' }),
      ];

      const result = await enhanceSuggestedRules('org-123', suggested, ['Amount', 'Reference'], ['Total', 'RefNo']);

      expect(result.influenced).toBe(true);
      const amountRule = result.rules.find((r) => r.columnA === 'Amount');
      expect(amountRule!.learned).toBe(true);
      const refRule = result.rules.find((r) => r.columnA === 'Reference');
      expect(refRule!.learned).toBeUndefined();
    });
  });

  describe('7. getLearnedVendorMappings returns mappings from database', () => {
    it('should return mappings with frequency >= 2', async () => {
      vi.mocked(getVendorMappings).mockResolvedValue([
        { sourceValue: 'J&J', targetValue: 'Johnson & Johnson', frequency: 5 },
        { sourceValue: 'ACME', targetValue: 'Acme Corp', frequency: 1 },
      ]);

      const result = await getLearnedVendorMappings('org-123');

      expect(result.get('J&J')).toBe('Johnson & Johnson');
      expect(result.has('ACME')).toBe(false);
      expect(result.size).toBe(1);
    });
  });

  describe('8. enhanceSuggestedRules with high-frequency pattern gets priority', () => {
    it('should boost weight more for higher frequency patterns', async () => {
      vi.mocked(getColumnPairPreferences).mockResolvedValue([
        { columnA: 'Amount', columnB: 'Total', frequency: 10, context: {} },
        { columnA: 'Reference', columnB: 'RefNo', frequency: 2, context: {} },
      ]);
      const suggested: MatchingRule[] = [
        rule({ columnA: 'Amount', columnB: 'Total', weight: 0.5 }),
        rule({ id: 'r2', columnA: 'Reference', columnB: 'RefNo', weight: 0.5 }),
      ];

      const result = await enhanceSuggestedRules('org-123', suggested, ['Amount', 'Reference'], ['Total', 'RefNo']);

      expect(result.influenced).toBe(true);
      const amountRule = result.rules.find((r) => r.columnA === 'Amount')!;
      const refRule = result.rules.find((r) => r.columnA === 'Reference')!;
      expect(amountRule.learned).toBe(true);
      expect(refRule.learned).toBe(true);
      expect(amountRule.weight).toBeGreaterThan(refRule.weight);
    });
  });
});
