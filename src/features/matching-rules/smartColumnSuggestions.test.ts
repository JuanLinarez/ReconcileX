/**
 * Smart column suggestion system unit tests.
 */
import { describe, it, expect } from 'vitest';
import { buildSuggestedRules } from './smartColumnSuggestions';
import type { ParsedCsv, RawCsvRow } from '@/features/reconciliation/types';

function parsedCsv(
  headers: string[],
  rows: RawCsvRow[] = [],
  source: 'sourceA' | 'sourceB' = 'sourceA'
): ParsedCsv {
  return { headers, rows, source };
}

describe('smartColumnSuggestions', () => {
  describe('1. Standard headers generate 4 rules', () => {
    it('should generate 4 rules for amount, date, reference, name with suggested: true', () => {
      const sourceA = parsedCsv(
        ['Amount', 'TransactionDate', 'Reference', 'VendorName'],
        [],
        'sourceA'
      );
      const sourceB = parsedCsv(
        ['Amount', 'TransactionDate', 'InvoiceNo', 'PayeeName'],
        [],
        'sourceB'
      );
      const rules = buildSuggestedRules(sourceA, sourceB);
      expect(rules).toHaveLength(4);
      expect(rules.every((r) => r.suggested === true)).toBe(true);
      const roles = rules.map((r) => {
        if (r.matchType === 'tolerance_numeric') return 'amount';
        if (r.matchType === 'tolerance_date') return 'date';
        if (r.matchType === 'exact' || r.matchType === 'similar_text') {
          if (r.columnA === 'VendorName' || r.columnB === 'PayeeName') return 'name';
          return 'reference';
        }
        return 'other';
      });
      expect(roles).toContain('amount');
      expect(roles).toContain('date');
      expect(roles).toContain('reference');
      expect(roles).toContain('name');
    });
  });

  describe('2. Alternative header names are recognized', () => {
    it('should classify Total/NetAmount, TransDate/PostingDate, InvNumber/RefNumber, CompanyName/Supplier', () => {
      const sourceA = parsedCsv(
        ['Total', 'TransDate', 'InvNumber', 'CompanyName'],
        [],
        'sourceA'
      );
      const sourceB = parsedCsv(
        ['NetAmount', 'PostingDate', 'RefNumber', 'Supplier'],
        [],
        'sourceB'
      );
      const rules = buildSuggestedRules(sourceA, sourceB);
      expect(rules.length).toBeGreaterThanOrEqual(3);
      const amountRule = rules.find(
        (r) => r.matchType === 'tolerance_numeric' && (r.columnA === 'Total' || r.columnB === 'NetAmount')
      );
      const dateRule = rules.find(
        (r) => r.matchType === 'tolerance_date' && (r.columnA === 'TransDate' || r.columnB === 'PostingDate')
      );
      const refRule = rules.find(
        (r) =>
          (r.matchType === 'exact' || r.matchType === 'similar_text') &&
          (r.columnA === 'InvNumber' || r.columnB === 'RefNumber')
      );
      const nameRule = rules.find(
        (r) =>
          r.matchType === 'similar_text' &&
          (r.columnA === 'CompanyName' || r.columnB === 'Supplier')
      );
      expect(amountRule).toBeDefined();
      expect(dateRule).toBeDefined();
      expect(refRule).toBeDefined();
      expect(nameRule).toBeDefined();
    });
  });

  describe('3. DueDate excluded from transaction_date role', () => {
    it('should use TransactionDate (not DueDate) for date rule', () => {
      const sourceA = parsedCsv(
        ['Amount', 'DueDate', 'TransactionDate', 'Reference'],
        [],
        'sourceA'
      );
      const sourceB = parsedCsv(['Amount', 'TransactionDate', 'Reference'], [], 'sourceB');
      const rules = buildSuggestedRules(sourceA, sourceB);
      const dateRule = rules.find((r) => r.matchType === 'tolerance_date');
      expect(dateRule).toBeDefined();
      expect(dateRule!.columnA).toBe('TransactionDate');
      expect(dateRule!.columnA).not.toBe('DueDate');
    });
  });

  describe('4. Department and Status columns skipped', () => {
    it('should not reference Department or Status in any rule', () => {
      const sourceA = parsedCsv(
        ['Amount', 'TransactionDate', 'Reference', 'Department', 'Status'],
        [],
        'sourceA'
      );
      const sourceB = parsedCsv(['Amount', 'TransactionDate', 'Reference'], [], 'sourceB');
      const rules = buildSuggestedRules(sourceA, sourceB);
      for (const r of rules) {
        expect(r.columnA).not.toBe('Department');
        expect(r.columnA).not.toBe('Status');
      }
      expect(rules.length).toBe(3);
    });
  });

  describe('5. Weights follow priority order', () => {
    it('should have amount > date > reference > name, weights sum to 1.0', () => {
      const sourceA = parsedCsv(
        ['Amount', 'TransactionDate', 'Reference', 'VendorName'],
        [],
        'sourceA'
      );
      const sourceB = parsedCsv(
        ['Amount', 'TransactionDate', 'InvoiceNo', 'PayeeName'],
        [],
        'sourceB'
      );
      const rules = buildSuggestedRules(sourceA, sourceB);
      const amountRule = rules.find((r) => r.matchType === 'tolerance_numeric');
      const dateRule = rules.find((r) => r.matchType === 'tolerance_date');
      const refRule = rules.find(
        (r) =>
          (r.matchType === 'exact' || r.matchType === 'similar_text') &&
          r.columnA === 'Reference'
      );
      const nameRule = rules.find(
        (r) => r.matchType === 'similar_text' && r.columnA === 'VendorName'
      );
      expect(amountRule!.weight).toBeGreaterThan(dateRule!.weight);
      expect(dateRule!.weight).toBeGreaterThan(refRule!.weight);
      expect(refRule!.weight).toBeGreaterThan(nameRule!.weight);
      const totalWeight = rules.reduce((s, r) => s + r.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 10);
    });
  });

  describe('6. Reference with uniform numeric values → exact matchType', () => {
    it('should use exact when reference values do not normalize to same across sources', () => {
      const rowsA: RawCsvRow[] = [
        { Amount: '100', Reference: '1001' },
        { Amount: '200', Reference: '1002' },
        { Amount: '300', Reference: '1003' },
      ];
      const rowsB: RawCsvRow[] = [
        { Amount: '100', Reference: '2001' },
        { Amount: '200', Reference: '2002' },
        { Amount: '300', Reference: '2003' },
      ];
      const sourceA = parsedCsv(['Amount', 'Reference'], rowsA, 'sourceA');
      const sourceB = parsedCsv(['Amount', 'Reference'], rowsB, 'sourceB');
      const rules = buildSuggestedRules(sourceA, sourceB);
      const refRule = rules.find(
        (r) => r.columnA === 'Reference' && r.columnB === 'Reference'
      );
      expect(refRule).toBeDefined();
      expect(refRule!.matchType).toBe('exact');
    });
  });

  describe('7. Reference with variable text → similar_text matchType', () => {
    it('should use similar_text when >30% of samples normalize to same across sources', () => {
      const rowsA: RawCsvRow[] = [
        { Amount: '100', Reference: 'Invoice-2025-001' },
        { Amount: '200', Reference: 'Inv 2025/002' },
        { Amount: '300', Reference: 'INV2025003' },
      ];
      const rowsB: RawCsvRow[] = [
        { Amount: '100', Reference: 'Invoice-2025-001' },
        { Amount: '200', Reference: 'Inv 2025/002' },
        { Amount: '300', Reference: 'INV2025003' },
      ];
      const sourceA = parsedCsv(['Amount', 'Reference'], rowsA, 'sourceA');
      const sourceB = parsedCsv(['Amount', 'Reference'], rowsB, 'sourceB');
      const rules = buildSuggestedRules(sourceA, sourceB);
      const refRule = rules.find(
        (r) => r.columnA === 'Reference' && r.columnB === 'Reference'
      );
      expect(refRule).toBeDefined();
      expect(refRule!.matchType).toBe('similar_text');
    });
  });

  describe('8. Only one matcheable column → single rule with weight 1.0', () => {
    it('should produce single Amount↔Total rule with weight 1.0', () => {
      const sourceA = parsedCsv(['Amount', 'Status', 'Department'], [], 'sourceA');
      const sourceB = parsedCsv(['Total', 'Category', 'Region'], [], 'sourceB');
      const rules = buildSuggestedRules(sourceA, sourceB);
      expect(rules).toHaveLength(1);
      expect(rules[0]!.columnA).toBe('Amount');
      expect(rules[0]!.columnB).toBe('Total');
      expect(rules[0]!.weight).toBeCloseTo(1.0, 10);
    });
  });
});
