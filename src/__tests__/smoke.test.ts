/**
 * Smoke tests — verify that the testing infrastructure works correctly.
 * If these pass, Vitest config, factories, mocks, and path aliases are all working.
 *
 * Run: npx vitest run src/__tests__/smoke.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  createTransaction,
  createMatchingPair,
  createUnmatchable,
  createRule,
  createConfig,
  createMatchResult,
  createReconciliationResult,
} from './factories/transactionFactory';
import { perfectSmall, partial50, edgeCases } from './factories/datasetFactory';
import {
  mockAnalyzeResponse,
  mockCopilotResponse,
  mockNlRulesResponse,
  mockNormalizeResponse,
} from './setup/mockAnthropic';
import type { Transaction, MatchingConfig } from '@/features/reconciliation/types';

describe('Smoke Tests — Testing Infrastructure', () => {
  describe('Transaction Factory', () => {
    it('should create a valid Transaction with defaults', () => {
      const txn = createTransaction();
      expect(txn).toBeDefined();
      expect(txn.id).toMatch(/^test-txn-/);
      expect(txn.source).toBe('sourceA');
      expect(typeof txn.amount).toBe('number');
      expect(txn.date).toBeInstanceOf(Date);
      expect(typeof txn.reference).toBe('string');
      expect(typeof txn.rowIndex).toBe('number');
      expect(txn.raw).toBeDefined();
    });

    it('should create a Transaction with overrides', () => {
      const txn = createTransaction({
        source: 'sourceB',
        amount: 2500.5,
        reference: 'CUSTOM-REF',
      });
      expect(txn.source).toBe('sourceB');
      expect(txn.amount).toBe(2500.5);
      expect(txn.reference).toBe('CUSTOM-REF');
    });

    it('should create a matching pair with correct sources', () => {
      const pair = createMatchingPair({ amount: 1000 });
      expect(pair.a.source).toBe('sourceA');
      expect(pair.b.source).toBe('sourceB');
      expect(pair.a.amount).toBe(1000);
      expect(pair.b.amount).toBe(1000);
    });

    it('should create a matching pair with amount difference', () => {
      const pair = createMatchingPair({ amount: 1000, amountDiffB: 2.5 });
      expect(pair.a.amount).toBe(1000);
      expect(pair.b.amount).toBe(1002.5);
    });

    it('should create unmatchable transactions', () => {
      const txn = createUnmatchable('sourceB');
      expect(txn.source).toBe('sourceB');
      expect(txn.amount).toBeGreaterThan(999999);
      expect(txn.reference).toMatch(/^NOMATCH-/);
    });
  });

  describe('Config Factory', () => {
    it('should create a valid MatchingConfig', () => {
      const config = createConfig();
      expect(config.rules).toHaveLength(1);
      expect(config.minConfidenceThreshold).toBe(0.7);
      expect(config.matchingType).toBe('oneToOne');
    });

    it('should create a rule with correct defaults', () => {
      const rule = createRule({ matchType: 'tolerance_numeric', toleranceValue: 0.05 });
      expect(rule.matchType).toBe('tolerance_numeric');
      expect(rule.toleranceValue).toBe(0.05);
      expect(rule.weight).toBe(1.0);
    });

    it('should create MatchResult and ReconciliationResult', () => {
      const a = createTransaction({ source: 'sourceA' });
      const b = createTransaction({ source: 'sourceB' });
      const match = createMatchResult([a], [b], 0.95);
      expect(match.transactionsA).toHaveLength(1);
      expect(match.transactionsB).toHaveLength(1);
      expect(match.confidence).toBe(0.95);

      const result = createReconciliationResult({ matched: [match] });
      expect(result.matched).toHaveLength(1);
      expect(result.config).toBeDefined();
    });
  });

  describe('Dataset Factory', () => {
    it('should create perfect-small dataset with 10 pairs', () => {
      const dataset = perfectSmall();
      expect(dataset.sourceA).toHaveLength(10);
      expect(dataset.sourceB).toHaveLength(10);
      expect(dataset.expected.matchedCount).toBe(10);
      expect(dataset.expected.unmatchedACount).toBe(0);
      expect(dataset.expected.unmatchedBCount).toBe(0);
    });

    it('should create partial-50 dataset with correct counts', () => {
      const dataset = partial50();
      expect(dataset.sourceA).toHaveLength(50);
      expect(dataset.sourceB).toHaveLength(40);
      expect(dataset.expected.matchedCount).toBe(30);
      expect(dataset.expected.unmatchedACount).toBe(20);
      expect(dataset.expected.unmatchedBCount).toBe(10);
    });

    it('should create edge-cases dataset', () => {
      const dataset = edgeCases();
      expect(dataset.sourceA).toHaveLength(5);
      // Verify negative amount is present
      const hasNegative = dataset.sourceA.some((t) => t.amount < 0);
      expect(hasNegative).toBe(true);
      // Verify zero amount is present
      const hasZero = dataset.sourceA.some((t) => t.amount === 0);
      expect(hasZero).toBe(true);
    });
  });

  describe('Mock Responses', () => {
    it('should have valid analyze mock response', () => {
      expect(mockAnalyzeResponse.probableCause).toBeTruthy();
      expect(mockAnalyzeResponse.recommendedAction).toBeTruthy();
      expect(mockAnalyzeResponse.suggestedMatch).toBeDefined();
      expect(mockAnalyzeResponse.suggestedMatch?.confidence).toMatch(/^(High|Medium|Low)$/);
    });

    it('should have valid copilot mock response', () => {
      expect(mockCopilotResponse.answer).toBeTruthy();
      expect(typeof mockCopilotResponse.answer).toBe('string');
    });

    it('should have valid NL rules mock response', () => {
      expect(mockNlRulesResponse.config.rules).toHaveLength(4);
      const weightSum = mockNlRulesResponse.config.rules.reduce((s, r) => s + r.weight, 0);
      expect(weightSum).toBeCloseTo(1.0, 2);
    });

    it('should have valid normalize mock response', () => {
      expect(mockNormalizeResponse.suggestions).toHaveLength(1);
      expect(mockNormalizeResponse.suggestions[0].mappings.length).toBeGreaterThan(0);
    });
  });

  describe('Path Alias Resolution', () => {
    it('should resolve @/ imports correctly', () => {
      // If this test file compiled and ran, the @/ alias works.
      // This import at the top proves it:
      // import type { Transaction } from '@/features/reconciliation/types';
      const txn: Transaction = createTransaction();
      const config: MatchingConfig = createConfig();
      expect(txn).toBeDefined();
      expect(config).toBeDefined();
    });
  });
});
