/**
 * Normalization service tests — applyAutoFix from dataQualityScanner.
 * The actual fix application logic lives in dataQualityScanner.applyAutoFix.
 */
import { describe, it, expect } from 'vitest';
import {
  scanDataQuality,
  applyAutoFix,
  type DataQualityIssue,
} from './dataQualityScanner';
import type { ParsedCsv } from '@/features/reconciliation/types';

function parsedCsv(
  headers: string[],
  rows: Record<string, string>[],
  source: 'sourceA' | 'sourceB' = 'sourceA'
): ParsedCsv {
  return { headers, rows, source };
}

describe('Normalization Service (applyAutoFix)', () => {
  describe('9. Normalize whitespace', () => {
    it('should trim leading and trailing whitespace', () => {
      const source = parsedCsv(
        ['VendorName', 'Amount'],
        [
          { VendorName: '  text  ', Amount: '100' },
          { VendorName: '  text  ', Amount: '200' },
        ]
      );
      const scan = scanDataQuality(source, parsedCsv(['VendorName', 'Amount'], []));
      const whitespaceOnly = scan.sourceA.filter((i) => i.type === 'leading_trailing_whitespace');
      const result = applyAutoFix(source, whitespaceOnly);
      expect(result.rows[0]!.VendorName).toBe('text');
      expect(result.rows[1]!.VendorName).toBe('text');
    });
  });

  describe('10. Normalize case', () => {
    it('should normalize mixed case to Title Case', () => {
      const source = parsedCsv(
        ['VendorName'],
        [
          { VendorName: 'ACME CORP' },
          { VendorName: 'acme corp' },
        ]
      );
      const scan = scanDataQuality(source, parsedCsv(['VendorName'], []));
      const result = applyAutoFix(source, scan.sourceA);
      expect(result.rows[0]!.VendorName).toBe('Acme Corp');
      expect(result.rows[1]!.VendorName).toBe('Acme Corp');
    });
  });

  describe('11. Normalize amount format', () => {
    it('should normalize inconsistent amount formats', () => {
      const source = parsedCsv(
        ['Amount', 'VendorName'],
        [
          { Amount: '$1,000.00', VendorName: 'Acme' },
          { Amount: '2000', VendorName: 'Beta' },
        ]
      );
      const scan = scanDataQuality(source, parsedCsv(['Amount', 'VendorName'], []));
      const result = applyAutoFix(source, scan.sourceA);
      expect(result.rows[0]!.Amount).not.toContain('$');
      expect(result.rows[0]!.Amount).not.toContain(',');
    });
  });

  describe('12. Preserve clean data', () => {
    it('should pass through data without issues unchanged', () => {
      const source = parsedCsv(
        ['VendorName', 'Amount'],
        [
          { VendorName: 'Acme', Amount: '100' },
          { VendorName: 'Beta', Amount: '200' },
        ]
      );
      const result = applyAutoFix(source, []);
      expect(result.rows[0]!.VendorName).toBe('Acme');
      expect(result.rows[0]!.Amount).toBe('100');
      expect(result.rows[1]!.VendorName).toBe('Beta');
      expect(result.rows[1]!.Amount).toBe('200');
    });
  });

  describe('13. Skip non-issue columns', () => {
    it('should only modify columns with detected issues', () => {
      const source = parsedCsv(
        ['VendorName', 'Amount', 'Reference'],
        [
          { VendorName: '  Acme  ', Amount: '100', Reference: 'REF-001' },
        ]
      );
      const whitespaceIssue: DataQualityIssue = {
        id: 'test-1',
        type: 'leading_trailing_whitespace',
        severity: 'low',
        column: 'VendorName',
        description: 'Whitespace in VendorName',
        affectedRows: [0],
        suggestedFix: 'Trim',
        autoFixable: true,
      };
      const result = applyAutoFix(source, [whitespaceIssue]);
      expect(result.rows[0]!.VendorName).toBe('Acme');
      expect(result.rows[0]!.Amount).toBe('100');
      expect(result.rows[0]!.Reference).toBe('REF-001');
    });
  });

  describe('14. Handle missing values gracefully', () => {
    it('should not crash on undefined or empty values', () => {
      const source = parsedCsv(
        ['VendorName', 'Amount'],
        [
          { VendorName: '', Amount: '' },
          { VendorName: undefined as unknown as string, Amount: '100' },
        ]
      );
      const result = applyAutoFix(source, []);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]!.VendorName).toBe('');
      expect(result.rows[1]!.Amount).toBe('100');
    });
  });
});
