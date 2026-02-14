/**
 * Anomaly detector unit tests — 8 detectors × 2 tests each (should detect / should NOT detect).
 */
import { describe, it, expect } from 'vitest';
import { detectAnomalies } from './anomalyDetector';
import {
  createTransaction,
  createMatchingPair,
  createMatchResult,
  createReconciliationResult,
  createConfig,
} from '@/__tests__/factories/transactionFactory';

describe('Anomaly Detector', () => {
  describe('1. Duplicate Payment', () => {
    it('SHOULD detect: 2 matched pairs with same amount and similar vendor', () => {
      const pair1 = createMatchingPair({
        amount: 5000,
        reference: 'REF-001',
        vendorA: 'Acme Corp',
        vendorB: 'Acme Corp',
      });
      const pair2 = createMatchingPair({
        amount: 5000,
        reference: 'REF-002',
        vendorA: 'Acme Corp.',
        vendorB: 'Acme Corp.',
      });
      const result = createReconciliationResult({
        matched: [
          createMatchResult([pair1.a], [pair1.b], 0.95),
          createMatchResult([pair2.a], [pair2.b], 0.95),
        ],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const dup = report.anomalies.filter((a) => a.type === 'duplicate_payment');
      expect(dup.length).toBeGreaterThanOrEqual(1);
      expect(dup[0]!.type).toBe('duplicate_payment');
      expect(dup[0]!.severity).toBe('critical');
    });

    it('should NOT detect: 2 matched pairs with same amount but different vendors', () => {
      const pair1 = createMatchingPair({
        amount: 5000,
        reference: 'REF-001',
        vendorA: 'Acme Corp',
        vendorB: 'Acme Corp',
      });
      const pair2 = createMatchingPair({
        amount: 5000,
        reference: 'REF-002',
        vendorA: 'Zebra Industries',
        vendorB: 'Zebra Industries',
      });
      const result = createReconciliationResult({
        matched: [
          createMatchResult([pair1.a], [pair1.b], 0.95),
          createMatchResult([pair2.a], [pair2.b], 0.95),
        ],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const dup = report.anomalies.filter((a) => a.type === 'duplicate_payment');
      expect(dup.length).toBe(0);
    });
  });

  describe('2. Round Amount', () => {
    it('SHOULD detect: unmatched transaction with amount $5,000 exactly', () => {
      const txn = createTransaction({
        source: 'sourceA',
        amount: 5000,
        raw: { Amount: '5000', Date: '2025-01-15', Reference: 'R1', VendorName: 'Acme' },
      });
      const result = createReconciliationResult({
        matched: [],
        unmatchedA: [txn],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const round = report.anomalies.filter((a) => a.type === 'round_amount');
      expect(round.length).toBe(1);
      expect(round[0]!.type).toBe('round_amount');
    });

    it('should NOT detect: amount below $5K or not round', () => {
      const txn = createTransaction({
        source: 'sourceA',
        amount: 4999.99,
        raw: { Amount: '4999.99', Date: '2025-01-15', Reference: 'R1', VendorName: 'Acme' },
      });
      const result = createReconciliationResult({
        matched: [],
        unmatchedA: [txn],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const round = report.anomalies.filter((a) => a.type === 'round_amount');
      expect(round.length).toBe(0);
    });
  });

  describe('3. Threshold Splitting', () => {
    it('SHOULD detect: 2 unmatched with same ref, amounts in band, within 7 days', () => {
      const baseDate = new Date('2025-01-15');
      const t1 = createTransaction({
        source: 'sourceA',
        amount: 4800,
        date: baseDate,
        reference: 'SPLIT-001',
        raw: { Amount: '4800', Date: baseDate.toISOString().slice(0, 10), Reference: 'SPLIT-001', VendorName: 'Acme' },
      });
      const t2 = createTransaction({
        source: 'sourceA',
        amount: 4700,
        date: new Date(baseDate.getTime() + 3 * 86400000),
        reference: 'SPLIT-001',
        raw: { Amount: '4700', Date: new Date(baseDate.getTime() + 3 * 86400000).toISOString().slice(0, 10), Reference: 'SPLIT-001', VendorName: 'Acme' },
      });
      const result = createReconciliationResult({
        matched: [],
        unmatchedA: [t1, t2],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const thresh = report.anomalies.filter((a) => a.type === 'threshold_splitting');
      expect(thresh.length).toBeGreaterThanOrEqual(1);
      expect(thresh[0]!.type).toBe('threshold_splitting');
    });

    it('should NOT detect: same scenario but dates 15 days apart', () => {
      const baseDate = new Date('2025-01-15');
      const t1 = createTransaction({
        source: 'sourceA',
        amount: 4800,
        date: baseDate,
        reference: 'SPLIT-002',
        raw: { Amount: '4800', Date: baseDate.toISOString().slice(0, 10), Reference: 'SPLIT-002', VendorName: 'Acme' },
      });
      const t2 = createTransaction({
        source: 'sourceA',
        amount: 4700,
        date: new Date(baseDate.getTime() + 15 * 86400000),
        reference: 'SPLIT-002',
        raw: { Amount: '4700', Date: new Date(baseDate.getTime() + 15 * 86400000).toISOString().slice(0, 10), Reference: 'SPLIT-002', VendorName: 'Acme' },
      });
      const result = createReconciliationResult({
        matched: [],
        unmatchedA: [t1, t2],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const thresh = report.anomalies.filter((a) => a.type === 'threshold_splitting');
      expect(thresh.length).toBe(0);
    });
  });

  describe('4. Unusual Amount', () => {
    it('SHOULD detect: many pairs at $1K, one outlier at $100K', () => {
      const pairs = Array.from({ length: 51 }, (_, i) =>
        createMatchingPair({
          amount: i < 50 ? 1000 : 100000,
          reference: `R-${i + 1}`,
        })
      );
      const result = createReconciliationResult({
        matched: pairs.map((p) => createMatchResult([p.a], [p.b], 0.95)),
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const unusual = report.anomalies.filter((a) => a.type === 'unusual_amount');
      expect(unusual.length).toBeGreaterThanOrEqual(1);
      expect(unusual[0]!.type).toBe('unusual_amount');
    });

    it('should NOT detect: 5 pairs all with similar amounts', () => {
      const pairs = [
        createMatchingPair({ amount: 1000, reference: 'R1' }),
        createMatchingPair({ amount: 1050, reference: 'R2' }),
        createMatchingPair({ amount: 980, reference: 'R3' }),
        createMatchingPair({ amount: 1020, reference: 'R4' }),
        createMatchingPair({ amount: 1100, reference: 'R5' }),
      ];
      const result = createReconciliationResult({
        matched: pairs.map((p) => createMatchResult([p.a], [p.b], 0.95)),
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const unusual = report.anomalies.filter((a) => a.type === 'unusual_amount');
      expect(unusual.length).toBe(0);
    });
  });

  describe('5. Weekend Transaction', () => {
    it('SHOULD detect: >2 transactions on Saturday', () => {
      const saturday = new Date('2025-01-18T12:00:00');
      const txns = [
        createTransaction({ source: 'sourceA', amount: 100, date: saturday, reference: 'R1', raw: { Amount: '100', Date: '2025-01-18', Reference: 'R1', VendorName: 'A' } }),
        createTransaction({ source: 'sourceA', amount: 200, date: saturday, reference: 'R2', raw: { Amount: '200', Date: '2025-01-18', Reference: 'R2', VendorName: 'B' } }),
        createTransaction({ source: 'sourceB', amount: 300, date: saturday, reference: 'R3', raw: { Amount: '300', Date: '2025-01-18', Reference: 'R3', VendorName: 'C' } }),
        createTransaction({ source: 'sourceB', amount: 400, date: saturday, reference: 'R4', raw: { Amount: '400', Date: '2025-01-18', Reference: 'R4', VendorName: 'D' } }),
      ];
      const result = createReconciliationResult({
        matched: [createMatchResult([txns[0]!, txns[1]!], [txns[2]!, txns[3]!], 0.9)],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const weekend = report.anomalies.filter((a) => a.type === 'weekend_transaction');
      expect(weekend.length).toBe(1);
      expect(weekend[0]!.type).toBe('weekend_transaction');
    });

    it('should NOT detect: only 1 transaction on weekend', () => {
      const saturday = new Date('2025-01-18');
      const monday = new Date('2025-01-20');
      const txnA = createTransaction({
        source: 'sourceA',
        date: saturday,
        raw: { Amount: '100', Date: '2025-01-18', Reference: 'R1', VendorName: 'A' },
      });
      const txnB = createTransaction({
        source: 'sourceB',
        date: monday,
        raw: { Amount: '100', Date: '2025-01-20', Reference: 'R1', VendorName: 'A' },
      });
      const result = createReconciliationResult({
        matched: [createMatchResult([txnA], [txnB], 0.9)],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const weekend = report.anomalies.filter((a) => a.type === 'weekend_transaction');
      expect(weekend.length).toBe(0);
    });
  });

  describe('6. Duplicate Reference', () => {
    it('SHOULD detect: same reference appears 2+ times in sourceA', () => {
      const t1 = createTransaction({
        source: 'sourceA',
        reference: 'REF-001',
        raw: { Amount: '100', Date: '2025-01-15', Reference: 'REF-001', VendorName: 'A' },
      });
      const t2 = createTransaction({
        source: 'sourceA',
        reference: 'REF-001',
        raw: { Amount: '200', Date: '2025-01-15', Reference: 'REF-001', VendorName: 'A' },
      });
      const result = createReconciliationResult({
        matched: [],
        unmatchedA: [t1, t2],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const dupRef = report.anomalies.filter((a) => a.type === 'duplicate_reference');
      expect(dupRef.length).toBeGreaterThanOrEqual(1);
      expect(dupRef[0]!.type).toBe('duplicate_reference');
    });

    it('should NOT detect: all unique references', () => {
      const pair1 = createMatchingPair({ amount: 1000, reference: 'REF-001' });
      const pair2 = createMatchingPair({ amount: 2000, reference: 'REF-002' });
      const result = createReconciliationResult({
        matched: [
          createMatchResult([pair1.a], [pair1.b], 0.95),
          createMatchResult([pair2.a], [pair2.b], 0.95),
        ],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const dupRef = report.anomalies.filter((a) => a.type === 'duplicate_reference');
      expect(dupRef.length).toBe(0);
    });
  });

  describe('7. Stale Unmatched', () => {
    it('SHOULD detect: unmatched >30 days older than newest', () => {
      const newest = new Date('2025-03-15');
      const stale = createTransaction({
        source: 'sourceA',
        date: new Date('2025-01-01'),
        reference: 'STALE-001',
        raw: { Amount: '100', Date: '2025-01-01', Reference: 'STALE-001', VendorName: 'A' },
      });
      const recent = createTransaction({
        source: 'sourceB',
        date: newest,
        reference: 'RECENT-001',
        raw: { Amount: '100', Date: '2025-03-15', Reference: 'RECENT-001', VendorName: 'B' },
      });
      const result = createReconciliationResult({
        matched: [],
        unmatchedA: [stale],
        unmatchedB: [recent],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const staleAnom = report.anomalies.filter((a) => a.type === 'stale_unmatched');
      expect(staleAnom.length).toBe(1);
      expect(staleAnom[0]!.type).toBe('stale_unmatched');
    });

    it('should NOT detect: all within 20 days', () => {
      const base = new Date('2025-01-15');
      const t1 = createTransaction({
        source: 'sourceA',
        date: base,
        reference: 'R1',
        raw: { Amount: '100', Date: '2025-01-15', Reference: 'R1', VendorName: 'A' },
      });
      const t2 = createTransaction({
        source: 'sourceA',
        date: new Date(base.getTime() + 10 * 86400000),
        reference: 'R2',
        raw: { Amount: '200', Date: '2025-01-25', Reference: 'R2', VendorName: 'A' },
      });
      const result = createReconciliationResult({
        matched: [],
        unmatchedA: [t1, t2],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const staleAnom = report.anomalies.filter((a) => a.type === 'stale_unmatched');
      expect(staleAnom.length).toBe(0);
    });
  });

  describe('8. Amount Mismatch Pattern', () => {
    it('SHOULD detect: 3 low-confidence matches with systematic $2.50 diff', () => {
      const pair1 = createMatchingPair({ amount: 100, reference: 'R1', amountDiffB: 2.5 });
      const pair2 = createMatchingPair({ amount: 200, reference: 'R2', amountDiffB: 2.5 });
      const pair3 = createMatchingPair({ amount: 300, reference: 'R3', amountDiffB: 2.5 });
      const result = createReconciliationResult({
        matched: [
          createMatchResult([pair1.a], [pair1.b], 0.8),
          createMatchResult([pair2.a], [pair2.b], 0.8),
          createMatchResult([pair3.a], [pair3.b], 0.8),
        ],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const amtMismatch = report.anomalies.filter((a) => a.type === 'amount_mismatch_pattern');
      expect(amtMismatch.length).toBeGreaterThanOrEqual(1);
      expect(amtMismatch[0]!.type).toBe('amount_mismatch_pattern');
    });

    it('should NOT detect: only 1 low-confidence match', () => {
      const pair1 = createMatchingPair({ amount: 100, reference: 'R1', amountDiffB: 2.5 });
      const pair2 = createMatchingPair({ amount: 200, reference: 'R2' });
      const pair3 = createMatchingPair({ amount: 300, reference: 'R3' });
      const result = createReconciliationResult({
        matched: [
          createMatchResult([pair1.a], [pair1.b], 0.8),
          createMatchResult([pair2.a], [pair2.b], 0.95),
          createMatchResult([pair3.a], [pair3.b], 0.95),
        ],
        config: createConfig(),
      });
      const report = detectAnomalies(result);
      const amtMismatch = report.anomalies.filter((a) => a.type === 'amount_mismatch_pattern');
      expect(amtMismatch.length).toBe(0);
    });
  });
});
