/**
 * Matching engine unit tests — rule scoring, 1:1 matching, group matching, edge cases.
 */
import { describe, it, expect } from 'vitest';
import { runMatching } from './matchingEngine';
import type { Transaction } from '@/features/reconciliation/types';
import {
  createTransaction,
  createMatchingPair,
  createUnmatchable,
  createRule,
  createConfig,
} from '@/__tests__/factories/transactionFactory';

/** Helper: create a transaction with full raw override for rule column names. */
function txn(
  source: 'sourceA' | 'sourceB',
  raw: Record<string, string>,
  overrides: Partial<Transaction> = {}
): Transaction {
  return createTransaction({
    source,
    amount: parseFloat(raw.Amount ?? '0') || 0,
    date: raw.Date ? new Date(raw.Date) : new Date('2025-01-15'),
    reference: raw.Reference ?? '',
    raw: { Amount: '', Date: '', Reference: '', ...raw },
    ...overrides,
  });
}

describe('Group 1: Rule Scoring — Exact', () => {
  it('should score 1.0 for exact match case-insensitive', () => {
    const a = txn('sourceA', { Amount: '1000', Date: '2025-01-15', Reference: 'ABC' });
    const b = txn('sourceB', { Amount: '1000', Date: '2025-01-15', Reference: 'abc' });
    const config = createConfig({
      rules: [
        createRule({ columnA: 'Reference', columnB: 'Reference', matchType: 'exact', weight: 1 }),
      ],
      minConfidenceThreshold: 0.99,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBeGreaterThanOrEqual(0.99);
  });

  it('should score 0 for exact no match when values differ', () => {
    const a = txn('sourceA', { Amount: '1000', Date: '2025-01-15', Reference: 'ABC' });
    const b = txn('sourceB', { Amount: '1000', Date: '2025-01-15', Reference: 'XYZ' });
    const config = createConfig({
      rules: [
        createRule({ columnA: 'Reference', columnB: 'Reference', matchType: 'exact', weight: 1 }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedA).toHaveLength(1);
    expect(result.unmatchedB).toHaveLength(1);
  });
});

describe('Group 2: Rule Scoring — Tolerance Numeric', () => {
  it('should score > 0 for tolerance_numeric fixed within tolerance', () => {
    const a = txn('sourceA', { Amount: '100', Date: '2025-01-15', Reference: 'R1' });
    const b = txn('sourceB', { Amount: '100.05', Date: '2025-01-15', Reference: 'R1' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'tolerance_numeric',
          toleranceValue: 0.1,
          toleranceNumericMode: 'fixed',
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBeGreaterThan(0);
  });

  it('should score 0 for tolerance_numeric fixed outside tolerance', () => {
    const a = txn('sourceA', { Amount: '100', Date: '2025-01-15', Reference: 'R1' });
    const b = txn('sourceB', { Amount: '101', Date: '2025-01-15', Reference: 'R1' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'tolerance_numeric',
          toleranceValue: 0.1,
          toleranceNumericMode: 'fixed',
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(0);
  });

  it('should score > 0 for tolerance_numeric percentage within', () => {
    const a = txn('sourceA', { Amount: '1000', Date: '2025-01-15', Reference: 'R1' });
    const b = txn('sourceB', { Amount: '1004', Date: '2025-01-15', Reference: 'R1' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'tolerance_numeric',
          toleranceValue: 0.005,
          toleranceNumericMode: 'percentage',
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBeGreaterThan(0);
  });

  it('should score 0 for tolerance_numeric percentage outside', () => {
    const a = txn('sourceA', { Amount: '1000', Date: '2025-01-15', Reference: 'R1' });
    const b = txn('sourceB', { Amount: '1060', Date: '2025-01-15', Reference: 'R1' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'tolerance_numeric',
          toleranceValue: 0.005,
          toleranceNumericMode: 'percentage',
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(0);
  });
});

describe('Group 3: Rule Scoring — Tolerance Date', () => {
  it('should score > 0 for tolerance_date within ±N days', () => {
    const a = txn('sourceA', { Amount: '1000', Date: '2025-01-15', Reference: 'R1' });
    const b = txn('sourceB', { Amount: '1000', Date: '2025-01-17', Reference: 'R1' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Date',
          columnB: 'Date',
          matchType: 'tolerance_date',
          toleranceValue: 3,
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBeGreaterThan(0);
  });

  it('should score 0 for tolerance_date outside ±N days', () => {
    const a = txn('sourceA', { Amount: '1000', Date: '2025-01-15', Reference: 'R1' });
    const b = txn('sourceB', { Amount: '1000', Date: '2025-01-30', Reference: 'R1' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Date',
          columnB: 'Date',
          matchType: 'tolerance_date',
          toleranceValue: 3,
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(0);
  });
});

describe('Group 4: Rule Scoring — Similar Text', () => {
  it('should score > 0 for similar_text above threshold', () => {
    const a = txn('sourceA', {
      Amount: '1000',
      Date: '2025-01-15',
      Reference: 'R1',
      VendorName: 'Johnson & Johnson',
    });
    const b = txn('sourceB', {
      Amount: '1000',
      Date: '2025-01-15',
      Reference: 'R1',
      VendorName: 'Johnson and Johnson',
    });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'VendorName',
          columnB: 'VendorName',
          matchType: 'similar_text',
          similarityThreshold: 0.7,
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBeGreaterThan(0);
  });

  it('should score 0 for similar_text below threshold', () => {
    const a = txn('sourceA', {
      Amount: '1000',
      Date: '2025-01-15',
      Reference: 'R1',
      VendorName: 'Apple Inc',
    });
    const b = txn('sourceB', {
      Amount: '1000',
      Date: '2025-01-15',
      Reference: 'R1',
      VendorName: 'Zebra Corp',
    });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'VendorName',
          columnB: 'VendorName',
          matchType: 'similar_text',
          similarityThreshold: 0.7,
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(0);
  });
});

describe('Group 5: Rule Scoring — Contains', () => {
  it('should score 1.0 for contains match', () => {
    const a = txn('sourceA', {
      Amount: '1000',
      Date: '2025-01-15',
      Reference: 'INV-2025-001',
    });
    const b = txn('sourceB', {
      Amount: '1000',
      Date: '2025-01-15',
      Reference: '2025-001',
    });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'contains',
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.99,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBeGreaterThanOrEqual(0.99);
  });

  it('should score 0 for contains no match', () => {
    const a = txn('sourceA', {
      Amount: '1000',
      Date: '2025-01-15',
      Reference: 'INV-2025-001',
    });
    const b = txn('sourceB', {
      Amount: '1000',
      Date: '2025-01-15',
      Reference: 'XYZ-999',
    });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'contains',
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(0);
  });
});

describe('Group 6: Weighted Scoring', () => {
  it('should produce ~1.0 when both rules score 1.0', () => {
    const pair = createMatchingPair({ amount: 1000, reference: 'REF-001' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'exact',
          weight: 0.6,
        }),
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 0.4,
        }),
      ],
      minConfidenceThreshold: 0.99,
      matchingType: 'oneToOne',
    });
    const result = runMatching([pair.a], [pair.b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBeCloseTo(1.0, 2);
  });

  it('should produce ~0.6 when one rule scores 1 and one scores 0', () => {
    const a = txn('sourceA', { Amount: '1000', Date: '2025-01-15', Reference: 'R1' });
    const b = txn('sourceB', { Amount: '1000', Date: '2025-01-15', Reference: 'XY' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'exact',
          weight: 0.6,
        }),
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 0.4,
        }),
      ],
      minConfidenceThreshold: 0.5,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBeCloseTo(0.6, 2);
  });

  it('should compute weighted sum for three rules with mixed scores', () => {
    const a = txn('sourceA', {
      Amount: '1000',
      Date: '2025-01-15',
      Reference: 'R1',
      VendorName: 'Acme',
    });
    const b = txn('sourceB', {
      Amount: '1000',
      Date: '2025-01-18',
      Reference: 'XY',
      VendorName: 'Acme',
    });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'exact',
          weight: 0.5,
        }),
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 0.25,
        }),
        createRule({
          columnA: 'VendorName',
          columnB: 'VendorName',
          matchType: 'exact',
          weight: 0.25,
        }),
      ],
      minConfidenceThreshold: 0.5,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(1);
    const score = result.matched[0].confidence;
    const expected = 0.5 * 1 + 0.25 * 0 + 0.25 * 1;
    expect(score).toBeCloseTo(expected, 2);
  });
});

describe('Group 7: 1:1 Matching — Full Pipeline', () => {
  it('should perfectly match 3A + 3B', () => {
    const pairs = [
      createMatchingPair({ amount: 1000, reference: 'REF-001' }),
      createMatchingPair({ amount: 2000, reference: 'REF-002' }),
      createMatchingPair({ amount: 3000, reference: 'REF-003' }),
    ];
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'exact',
          weight: 0.5,
        }),
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 0.5,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching(
      pairs.map((p) => p.a),
      pairs.map((p) => p.b),
      config
    );
    expect(result.matched).toHaveLength(3);
    expect(result.unmatchedA).toHaveLength(0);
    expect(result.unmatchedB).toHaveLength(0);
  });

  it('should match 2 when more A than B (3A + 2B)', () => {
    const pairs = [
      createMatchingPair({ amount: 1000, reference: 'REF-001' }),
      createMatchingPair({ amount: 2000, reference: 'REF-002' }),
    ];
    const extraA = createUnmatchable('sourceA');
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'exact',
          weight: 0.5,
        }),
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 0.5,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching(
      [...pairs.map((p) => p.a), extraA],
      pairs.map((p) => p.b),
      config
    );
    expect(result.matched).toHaveLength(2);
    expect(result.unmatchedA).toHaveLength(1);
    expect(result.unmatchedB).toHaveLength(0);
  });

  it('should match 2 when more B than A (2A + 3B)', () => {
    const pairs = [
      createMatchingPair({ amount: 1000, reference: 'REF-001' }),
      createMatchingPair({ amount: 2000, reference: 'REF-002' }),
    ];
    const extraB = createUnmatchable('sourceB');
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'exact',
          weight: 0.5,
        }),
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 0.5,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching(
      pairs.map((p) => p.a),
      [...pairs.map((p) => p.b), extraB],
      config
    );
    expect(result.matched).toHaveLength(2);
    expect(result.unmatchedA).toHaveLength(0);
    expect(result.unmatchedB).toHaveLength(1);
  });

  it('should assign A1→B1 and A2→B2 in competition for best match', () => {
    const a1 = txn('sourceA', { Amount: '1000', Date: '2025-01-15', Reference: 'REF001' });
    const a2 = txn('sourceA', { Amount: '1000', Date: '2025-01-15', Reference: 'ABCD' });
    const b1 = txn('sourceB', { Amount: '1000', Date: '2025-01-15', Reference: 'REF002' });
    const b2 = txn('sourceB', { Amount: '1025', Date: '2025-01-15', Reference: 'ABCE' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'tolerance_numeric',
          toleranceValue: 10,
          toleranceNumericMode: 'fixed',
          weight: 0.6,
        }),
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 0.4,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a1, a2], [b1, b2], config);
    expect(result.matched).toHaveLength(2);
    const a1Match = result.matched.find((m) => m.transactionsA[0].id === a1.id);
    const a2Match = result.matched.find((m) => m.transactionsA[0].id === a2.id);
    expect(a1Match?.transactionsB[0].id).toBe(b1.id);
    expect(a2Match?.transactionsB[0].id).toBe(b2.id);
  });

  it('should filter out all pairs below threshold', () => {
    const a = txn('sourceA', { Amount: '100', Date: '2025-01-15', Reference: 'X' });
    const b = txn('sourceB', { Amount: '200', Date: '2025-06-15', Reference: 'Y' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'exact',
          weight: 0.5,
        }),
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 0.5,
        }),
      ],
      minConfidenceThreshold: 0.99,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedA).toHaveLength(1);
    expect(result.unmatchedB).toHaveLength(1);
  });
});

describe('Group 8: Group Matching', () => {
  it('should 1:Many match one $300 in A to three $100 in B', () => {
    const a = txn('sourceA', { Amount: '300', Date: '2025-01-15', Reference: 'R1' });
    const b1 = txn('sourceB', { Amount: '100', Date: '2025-01-15', Reference: 'R1' });
    const b2 = txn('sourceB', { Amount: '100', Date: '2025-01-15', Reference: 'R2' });
    const b3 = txn('sourceB', { Amount: '100', Date: '2025-01-15', Reference: 'R3' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'tolerance_numeric',
          toleranceValue: 1,
          toleranceNumericMode: 'fixed',
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'group',
    });
    const result = runMatching([a], [b1, b2, b3], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].transactionsA).toHaveLength(1);
    expect(result.matched[0].transactionsB).toHaveLength(3);
    expect(result.unmatchedA).toHaveLength(0);
    expect(result.unmatchedB).toHaveLength(0);
  });

  it('should Many:1 match three in A to one in B', () => {
    const a1 = txn('sourceA', { Amount: '100', Date: '2025-01-15', Reference: 'R1' });
    const a2 = txn('sourceA', { Amount: '100', Date: '2025-01-15', Reference: 'R2' });
    const a3 = txn('sourceA', { Amount: '100', Date: '2025-01-15', Reference: 'R3' });
    const b = txn('sourceB', { Amount: '300', Date: '2025-01-15', Reference: 'R1' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'tolerance_numeric',
          toleranceValue: 1,
          toleranceNumericMode: 'fixed',
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'group',
    });
    const result = runMatching([a1, a2, a3], [b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].transactionsA).toHaveLength(3);
    expect(result.matched[0].transactionsB).toHaveLength(1);
    expect(result.unmatchedA).toHaveLength(0);
    expect(result.unmatchedB).toHaveLength(0);
  });
});

describe('Group 9: Edge Cases', () => {
  it('should match negative amounts', () => {
    const pair = createMatchingPair({ amount: -500, reference: 'CREDIT-001' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'exact',
          weight: 0.5,
        }),
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 0.5,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([pair.a], [pair.b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBeGreaterThan(0);
  });

  it('should match zero amount', () => {
    const pair = createMatchingPair({ amount: 0, reference: 'ZERO-001' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'exact',
          weight: 0.5,
        }),
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 0.5,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([pair.a], [pair.b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBeGreaterThan(0);
  });

  it('should match when both have empty reference (amount rule only)', () => {
    const a = txn('sourceA', { Amount: '1000', Date: '2025-01-15', Reference: '' });
    const b = txn('sourceB', { Amount: '1000', Date: '2025-01-15', Reference: '' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'exact',
          weight: 1,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([a], [b], config);
    expect(result.matched).toHaveLength(1);
  });

  it('should match special characters in reference', () => {
    const pair = createMatchingPair({ amount: 1000, reference: 'INV#2025/001' });
    const config = createConfig({
      rules: [
        createRule({
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'exact',
          weight: 0.5,
        }),
        createRule({
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 0.5,
        }),
      ],
      minConfidenceThreshold: 0.7,
      matchingType: 'oneToOne',
    });
    const result = runMatching([pair.a], [pair.b], config);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBeGreaterThan(0);
  });
});
