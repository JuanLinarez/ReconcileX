/**
 * Pattern capture unit tests.
 * Mocks @/lib/database to avoid real Supabase calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  captureRuleConfiguration,
  captureMatchAcceptance,
  captureMatchRejection,
  captureNormalizationDecision,
} from './patternCapture';
import { recordPattern } from '@/lib/database';
import type { Transaction, MatchingRule } from '@/features/reconciliation/types';

vi.mock('@/lib/database', () => ({
  recordPattern: vi.fn(),
}));

function tx(
  overrides: Partial<Transaction> & { reference: string; amount: number }
): Transaction {
  const { amount, reference, raw, ...rest } = overrides;
  return {
    id: 'tx-1',
    source: 'sourceA',
    amount,
    date: new Date(),
    reference,
    rowIndex: 1,
    raw: raw ?? { reference },
    ...rest,
  };
}

describe('patternCapture', () => {
  beforeEach(() => {
    vi.mocked(recordPattern).mockClear();
    vi.mocked(recordPattern).mockResolvedValue(true);
  });

  describe('1. captureRuleConfiguration records column_pair_preference', () => {
    it('should call recordPattern with column_pair_preference for each rule', () => {
      const rules: MatchingRule[] = [
        { id: 'r1', columnA: 'Amount', columnB: 'Total', matchType: 'tolerance_numeric', weight: 0.4 },
        { id: 'r2', columnA: 'Reference', columnB: 'RefNo', matchType: 'exact', weight: 0.6 },
      ];
      captureRuleConfiguration('org-123', rules);

      expect(recordPattern).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          pattern_type: 'column_pair_preference',
          column_a: 'Amount',
          column_b: 'Total',
          context: { matchType: 'tolerance_numeric', weight: 0.4 },
        })
      );
      expect(recordPattern).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          pattern_type: 'column_pair_preference',
          column_a: 'Reference',
          column_b: 'RefNo',
          context: { matchType: 'exact', weight: 0.6 },
        })
      );
      expect(recordPattern).toHaveBeenCalledTimes(2);
    });
  });

  describe('2. captureMatchAcceptance records match_acceptance', () => {
    it('should call recordPattern with match_acceptance and column_pair_preference', () => {
      const txA = tx({ reference: 'REF-001', amount: 100.5, raw: { reference: 'REF-001' } });
      const txB = tx({ reference: 'REF-001', amount: 100.5, source: 'sourceB', raw: { reference: 'REF-001' } });
      const rules: MatchingRule[] = [
        { id: 'r1', columnA: 'Amount', columnB: 'Total', matchType: 'tolerance_numeric', weight: 0.5 },
      ];

      captureMatchAcceptance('org-123', txA, txB, rules);

      expect(recordPattern).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          pattern_type: 'match_acceptance',
          source_value: 'REF-001|100.50',
          target_value: 'REF-001|100.50',
        })
      );
      expect(recordPattern).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          pattern_type: 'column_pair_preference',
          column_a: 'Amount',
          column_b: 'Total',
        })
      );
    });
  });

  describe('3. captureMatchRejection records match_rejection', () => {
    it('should call recordPattern with match_rejection', () => {
      const txA = tx({ reference: 'REF-001', amount: 100, raw: { reference: 'REF-001' } });
      const txB = tx({ reference: 'REF-002', amount: 100, source: 'sourceB', raw: { reference: 'REF-002' } });

      captureMatchRejection('org-123', txA, txB);

      expect(recordPattern).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          pattern_type: 'match_rejection',
          source_value: 'REF-001|100.00',
          target_value: 'REF-002|100.00',
        })
      );
    });
  });

  describe('4. captureNormalizationDecision records normalization_rule', () => {
    it('should call recordPattern with normalization_rule for accepted decisions', () => {
      captureNormalizationDecision('org-123', [
        { original: 'ACME', normalized: 'Acme Corp', column: 'VendorName', accepted: true },
        { original: 'J&J', normalized: 'Johnson & Johnson', column: 'VendorName', accepted: false },
        { original: 'Beta', normalized: 'Beta Inc', column: 'VendorName', accepted: true },
      ]);

      expect(recordPattern).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          pattern_type: 'normalization_rule',
          source_value: 'ACME',
          target_value: 'Acme Corp',
          column_a: 'VendorName',
        })
      );
      expect(recordPattern).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          pattern_type: 'normalization_rule',
          source_value: 'Beta',
          target_value: 'Beta Inc',
          column_a: 'VendorName',
        })
      );
      expect(recordPattern).toHaveBeenCalledTimes(2);
    });
  });
});
