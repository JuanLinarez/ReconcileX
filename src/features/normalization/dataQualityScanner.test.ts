/**
 * Data quality scanner unit tests.
 */
import { describe, it, expect } from 'vitest';
import { scanDataQuality } from './dataQualityScanner';
import type { ParsedCsv } from '@/features/reconciliation/types';

function parsedCsv(
  headers: string[],
  rows: Record<string, string>[],
  source: 'sourceA' | 'sourceB' = 'sourceA'
): ParsedCsv {
  return { headers, rows, source };
}

describe('Data Quality Scanner', () => {
  describe('1. Detect whitespace', () => {
    it('should detect leading/trailing whitespace in values', () => {
      const sourceA = parsedCsv(
        ['VendorName', 'Amount'],
        [
          { VendorName: '  Johnson  ', Amount: '100' },
          { VendorName: 'Acme', Amount: '200' },
        ]
      );
      const sourceB = parsedCsv(['VendorName', 'Amount'], [{ VendorName: 'Beta', Amount: '50' }]);
      const result = scanDataQuality(sourceA, sourceB);
      const whitespace = result.sourceA.filter((i) => i.type === 'leading_trailing_whitespace');
      expect(whitespace.length).toBeGreaterThanOrEqual(1);
      expect(whitespace.some((i) => i.column === 'VendorName')).toBe(true);
      expect(whitespace[0]!.affectedRows).toContain(0);
    });
  });

  describe('2. Detect case inconsistency', () => {
    it('should detect mixed case in same column', () => {
      const sourceA = parsedCsv(
        ['VendorName'],
        [
          { VendorName: 'ACME' },
          { VendorName: 'Acme' },
          { VendorName: 'acme' },
        ]
      );
      const sourceB = parsedCsv(['VendorName'], [{ VendorName: 'Beta' }]);
      const result = scanDataQuality(sourceA, sourceB);
      const mixed = result.sourceA.filter((i) => i.type === 'mixed_case');
      expect(mixed.length).toBeGreaterThanOrEqual(1);
      expect(mixed.some((i) => i.column === 'VendorName')).toBe(true);
    });
  });

  describe('3. Detect date format inconsistency', () => {
    it('should detect mixed date formats in date column', () => {
      const sourceA = parsedCsv(
        ['Date', 'Amount'],
        [
          { Date: '01/15/2025', Amount: '100' },
          { Date: '2025-01-16', Amount: '200' },
        ]
      );
      const sourceB = parsedCsv(['Date', 'Amount'], [{ Date: '2025-01-17', Amount: '50' }]);
      const result = scanDataQuality(sourceA, sourceB);
      const dateIssues = result.sourceA.filter((i) => i.type === 'inconsistent_date_format');
      expect(dateIssues.length).toBeGreaterThanOrEqual(1);
      expect(dateIssues.some((i) => i.column === 'Date')).toBe(true);
    });
  });

  describe('4. Detect special characters', () => {
    it('should detect special characters in reference column', () => {
      const sourceA = parsedCsv(
        ['Reference', 'Amount'],
        [
          { Reference: 'INV-001', Amount: '100' },
          { Reference: 'INV—002', Amount: '200' },
        ]
      );
      const sourceB = parsedCsv(['Reference', 'Amount'], [{ Reference: 'INV-003', Amount: '50' }]);
      const result = scanDataQuality(sourceA, sourceB);
      const special = result.sourceA.filter((i) => i.type === 'special_characters_in_reference');
      expect(special.length).toBeGreaterThanOrEqual(1);
      expect(special[0]!.affectedRows).toContain(1);
    });
  });

  describe('5. Detect empty values', () => {
    it('should detect empty values in key column when >10% and other source has data', () => {
      const sourceA = parsedCsv(
        ['VendorName', 'Amount'],
        [
          { VendorName: '', Amount: '100' },
          { VendorName: '', Amount: '200' },
          { VendorName: '', Amount: '300' },
          { VendorName: '', Amount: '400' },
          { VendorName: '', Amount: '500' },
          { VendorName: 'Acme', Amount: '600' },
        ]
      );
      const sourceB = parsedCsv(
        ['VendorName', 'Amount'],
        [{ VendorName: 'Beta', Amount: '50' }]
      );
      const result = scanDataQuality(sourceA, sourceB);
      const empty = result.sourceA.filter((i) => i.type === 'empty_values');
      expect(empty.length).toBeGreaterThanOrEqual(1);
      expect(empty.some((i) => i.column === 'VendorName')).toBe(true);
    });
  });

  describe('6. Detect vendor name variations', () => {
    it('should detect similar vendor names (Coca-Cola vs Coca Cola)', () => {
      const sourceA = parsedCsv(
        ['VendorName', 'Amount'],
        [
          { VendorName: 'Coca-Cola', Amount: '100' },
          { VendorName: 'Acme', Amount: '200' },
        ]
      );
      const sourceB = parsedCsv(
        ['VendorName', 'Amount'],
        [
          { VendorName: 'Coca Cola', Amount: '50' },
          { VendorName: 'Beta', Amount: '75' },
        ]
      );
      const result = scanDataQuality(sourceA, sourceB);
      const vendor = [
        ...result.sourceA.filter((i) => i.type === 'vendor_name_variations'),
        ...result.sourceB.filter((i) => i.type === 'vendor_name_variations'),
      ];
      expect(vendor.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('7. Clean dataset', () => {
    it('should report 0 issues for clean consistent data', () => {
      const sourceA = parsedCsv(
        ['VendorName', 'Amount', 'Date'],
        [{ VendorName: 'Acme', Amount: '100', Date: '2025-01-15' }]
      );
      const sourceB = parsedCsv(
        ['VendorName', 'Amount', 'Date'],
        [{ VendorName: 'Acme', Amount: '100', Date: '2025-01-15' }]
      );
      const result = scanDataQuality(sourceA, sourceB);
      expect(result.totalIssues).toBe(0);
      expect(result.sourceA).toHaveLength(0);
      expect(result.sourceB).toHaveLength(0);
    });
  });

  describe('8. Multiple issues', () => {
    it('should detect multiple different issue types', () => {
      const sourceA = parsedCsv(
        ['VendorName', 'Amount', 'Date', 'Reference'],
        [
          { VendorName: '  Acme  ', Amount: '100', Date: '01/15/2025', Reference: 'REF-001' },
          { VendorName: 'ACME', Amount: '200', Date: '2025-01-16', Reference: 'REF—002' },
        ]
      );
      const sourceB = parsedCsv(
        ['VendorName', 'Amount', 'Date', 'Reference'],
        [{ VendorName: 'Beta', Amount: '50', Date: '2025-01-17', Reference: 'REF-003' }]
      );
      const result = scanDataQuality(sourceA, sourceB);
      const types = new Set([...result.sourceA, ...result.sourceB].map((i) => i.type));
      expect(types.has('leading_trailing_whitespace')).toBe(true);
      expect(types.has('mixed_case')).toBe(true);
      expect(types.has('inconsistent_date_format')).toBe(true);
      expect(types.has('special_characters_in_reference')).toBe(true);
      expect(result.totalIssues).toBeGreaterThanOrEqual(4);
    });
  });
});
