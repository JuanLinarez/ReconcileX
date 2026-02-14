/**
 * Engine parity tests — verify client and server matching engines produce identical results.
 * The matching logic is duplicated in matchingEngine.ts (client) and api/match.ts (server).
 */
import { describe, it, expect, vi } from 'vitest';
import { runMatching } from './matchingEngine';
import { serverMatchingEngine } from '../../../../api/match';
import { perfectSmall, partial50, edgeCases } from '@/__tests__/factories/datasetFactory';
import {
  createMatchingPair,
  createRule,
  createConfig,
  resetIdCounter,
} from '@/__tests__/factories/transactionFactory';

// Mock @vercel/node so api/match.ts can be imported in tests
vi.mock('@vercel/node', () => ({}));

function assertParity(
  clientResult: { matched: { confidence: number }[]; unmatchedA: unknown[]; unmatchedB: unknown[] },
  serverResult: { matched: { confidence: number }[]; unmatchedA: unknown[]; unmatchedB: unknown[] }
): void {
  expect(clientResult.matched.length).toBe(serverResult.matched.length);
  expect(clientResult.unmatchedA.length).toBe(serverResult.unmatchedA.length);
  expect(clientResult.unmatchedB.length).toBe(serverResult.unmatchedB.length);

  const clientScores = clientResult.matched.map((m) => m.confidence).sort((a, b) => a - b);
  const serverScores = serverResult.matched.map((m) => m.confidence).sort((a, b) => a - b);
  expect(clientScores.length).toBe(serverScores.length);
  clientScores.forEach((score, i) => {
    expect(score).toBeCloseTo(serverScores[i], 4);
  });
}

describe('Engine Parity — Client vs Server', () => {
  describe('Parity Test 1: Perfect dataset', () => {
    it('should produce identical results for perfectSmall', () => {
      const dataset = perfectSmall();
      const clientResult = runMatching(
        dataset.sourceA,
        dataset.sourceB,
        dataset.config
      );
      const serverResult = serverMatchingEngine(
        dataset.sourceA,
        dataset.sourceB,
        dataset.config
      );
      assertParity(clientResult, serverResult);
      expect(clientResult.matched.length).toBe(dataset.expected.matchedCount);
    });
  });

  describe('Parity Test 2: Partial dataset', () => {
    it('should produce identical results for partial50', () => {
      const dataset = partial50();
      const clientResult = runMatching(
        dataset.sourceA,
        dataset.sourceB,
        dataset.config
      );
      const serverResult = serverMatchingEngine(
        dataset.sourceA,
        dataset.sourceB,
        dataset.config
      );
      assertParity(clientResult, serverResult);
      expect(clientResult.matched.length).toBe(dataset.expected.matchedCount);
      expect(clientResult.unmatchedA.length).toBe(dataset.expected.unmatchedACount);
      expect(clientResult.unmatchedB.length).toBe(dataset.expected.unmatchedBCount);
    });
  });

  describe('Parity Test 3: Edge cases', () => {
    it('should produce identical results for edgeCases', () => {
      const dataset = edgeCases();
      const clientResult = runMatching(
        dataset.sourceA,
        dataset.sourceB,
        dataset.config
      );
      const serverResult = serverMatchingEngine(
        dataset.sourceA,
        dataset.sourceB,
        dataset.config
      );
      assertParity(clientResult, serverResult);
      expect(clientResult.matched.length).toBe(dataset.expected.matchedCount);
    });
  });

  describe('Parity Test 4: Tolerance numeric', () => {
    it('should produce identical results with tolerance_numeric fixed', () => {
      resetIdCounter();
      const pairs = [
        createMatchingPair({ amount: 100, reference: 'R1', amountDiffB: 0.05 }),
        createMatchingPair({ amount: 200, reference: 'R2', amountDiffB: -0.03 }),
        createMatchingPair({ amount: 150, reference: 'R3', amountDiffB: 0.08 }),
      ];
      const config = createConfig({
        rules: [
          createRule({
            columnA: 'Amount',
            columnB: 'Amount',
            matchType: 'tolerance_numeric',
            toleranceValue: 0.1,
            toleranceNumericMode: 'fixed',
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
      const sourceA = pairs.map((p) => p.a);
      const sourceB = pairs.map((p) => p.b);

      const clientResult = runMatching(sourceA, sourceB, config);
      const serverResult = serverMatchingEngine(sourceA, sourceB, config);
      assertParity(clientResult, serverResult);
      expect(clientResult.matched.length).toBe(3);
    });
  });

  describe('Parity Test 5: Similar text', () => {
    it('should produce identical results with similar_text rule', () => {
      resetIdCounter();
      const pairs = [
        createMatchingPair({
          amount: 1000,
          reference: 'R1',
          vendorA: 'Johnson & Johnson',
          vendorB: 'Johnson and Johnson',
        }),
        createMatchingPair({
          amount: 2000,
          reference: 'R2',
          vendorA: 'Acme Corp',
          vendorB: 'Acme Corp',
        }),
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
            columnA: 'VendorName',
            columnB: 'VendorName',
            matchType: 'similar_text',
            similarityThreshold: 0.7,
            weight: 0.5,
          }),
        ],
        minConfidenceThreshold: 0.7,
        matchingType: 'oneToOne',
      });
      const sourceA = pairs.map((p) => p.a);
      const sourceB = pairs.map((p) => p.b);

      const clientResult = runMatching(sourceA, sourceB, config);
      const serverResult = serverMatchingEngine(sourceA, sourceB, config);
      assertParity(clientResult, serverResult);
      expect(clientResult.matched.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Parity Test 6: Group matching', () => {
    it('should produce identical results with group matching', () => {
      resetIdCounter();
      const a = createMatchingPair({ amount: 300, reference: 'R1' }).a;
      const b1 = createMatchingPair({ amount: 100, reference: 'R2' }).b;
      const b2 = createMatchingPair({ amount: 100, reference: 'R3' }).b;
      const b3 = createMatchingPair({ amount: 100, reference: 'R4' }).b;

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

      const sourceA = [a];
      const sourceB = [b1, b2, b3];

      const clientResult = runMatching(sourceA, sourceB, config);
      const serverResult = serverMatchingEngine(sourceA, sourceB, config);
      assertParity(clientResult, serverResult);
      expect(clientResult.matched.length).toBe(1);
      expect(clientResult.matched[0].transactionsB.length).toBe(3);
    });
  });
});
