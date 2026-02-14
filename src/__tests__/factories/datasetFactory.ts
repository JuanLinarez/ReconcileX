/**
 * Dataset factory — generates complete source A/B datasets with known outcomes.
 * Used for integration-style tests of the matching engine.
 */
import type { Transaction, MatchingConfig } from '@/features/reconciliation/types';
import {
  createMatchingPair,
  createUnmatchable,
  createConfig,
  createRule,
  resetIdCounter,
} from './transactionFactory';

export interface TestDataset {
  name: string;
  sourceA: Transaction[];
  sourceB: Transaction[];
  config: MatchingConfig;
  expected: {
    matchedCount: number;
    unmatchedACount: number;
    unmatchedBCount: number;
  };
}

/** Perfect dataset: all transactions match exactly. */
export function perfectSmall(): TestDataset {
  resetIdCounter();
  const pairs = Array.from({ length: 10 }, (_, i) =>
    createMatchingPair({ amount: 1000 + i * 100, reference: `REF-${String(i + 1).padStart(4, '0')}` })
  );

  return {
    name: 'perfect-small',
    sourceA: pairs.map((p) => p.a),
    sourceB: pairs.map((p) => p.b),
    config: createConfig({
      rules: [
        createRule({ columnA: 'Amount', columnB: 'Amount', matchType: 'exact', weight: 0.5 }),
        createRule({ columnA: 'Reference', columnB: 'Reference', matchType: 'exact', weight: 0.5 }),
      ],
      minConfidenceThreshold: 0.7,
    }),
    expected: { matchedCount: 10, unmatchedACount: 0, unmatchedBCount: 0 },
  };
}

/** Partial dataset: some match, some don't. */
export function partial50(): TestDataset {
  resetIdCounter();
  // 30 matching pairs
  const pairs = Array.from({ length: 30 }, (_, i) =>
    createMatchingPair({ amount: 500 + i * 50, reference: `REF-${String(i + 1).padStart(4, '0')}` })
  );
  // 20 extra in A, 10 extra in B
  const extraA = Array.from({ length: 20 }, () => createUnmatchable('sourceA'));
  const extraB = Array.from({ length: 10 }, () => createUnmatchable('sourceB'));

  return {
    name: 'partial-50',
    sourceA: [...pairs.map((p) => p.a), ...extraA],
    sourceB: [...pairs.map((p) => p.b), ...extraB],
    config: createConfig({
      rules: [
        createRule({ columnA: 'Amount', columnB: 'Amount', matchType: 'exact', weight: 0.5 }),
        createRule({ columnA: 'Reference', columnB: 'Reference', matchType: 'exact', weight: 0.5 }),
      ],
      minConfidenceThreshold: 0.7,
    }),
    expected: { matchedCount: 30, unmatchedACount: 20, unmatchedBCount: 10 },
  };
}

/** Edge cases: negative amounts, zero amounts, special characters. */
export function edgeCases(): TestDataset {
  resetIdCounter();
  const pairs = [
    createMatchingPair({ amount: -500, reference: 'CREDIT-001' }),
    createMatchingPair({ amount: 0, reference: 'ZERO-001' }),
    createMatchingPair({ amount: 0.01, reference: 'PENNY-001' }),
    createMatchingPair({ amount: 99999.99, reference: 'BIG-001' }),
    createMatchingPair({ amount: 1234.56, reference: 'INV#2025/001' }),
  ];

  return {
    name: 'edge-cases',
    sourceA: pairs.map((p) => p.a),
    sourceB: pairs.map((p) => p.b),
    config: createConfig({
      rules: [
        createRule({ columnA: 'Amount', columnB: 'Amount', matchType: 'exact', weight: 0.5 }),
        createRule({ columnA: 'Reference', columnB: 'Reference', matchType: 'exact', weight: 0.5 }),
      ],
      minConfidenceThreshold: 0.7,
    }),
    expected: { matchedCount: 5, unmatchedACount: 0, unmatchedBCount: 0 },
  };
}
