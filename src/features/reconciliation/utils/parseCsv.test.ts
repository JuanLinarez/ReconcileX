/**
 * CSV parsing and serialization utility tests.
 * Uses Papa.parse with string input (worker: false) because parseCsvFile(File)
 * triggers FileReaderSync which is unavailable in Node.
 */
import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import {
  serializeToCsv,
  withSource,
} from './parseCsv';
import type { ParsedCsv, RawCsvRow } from '../types';

/** Parse CSV string using same Papa config as parseCsvFile (minus worker). */
function parseCsvString(csv: string): { headers: string[]; rows: RawCsvRow[] } {
  const result = Papa.parse<RawCsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
    worker: false,
  });
  if (result.errors.length > 0) throw new Error(result.errors[0]?.message ?? 'Parse failed');
  const rows = result.data as RawCsvRow[];
  const headers = result.meta.fields ?? (rows[0] ? Object.keys(rows[0]) : []);
  return { headers, rows };
}

describe('parseCsv', () => {
  describe('1. Parse standard CSV string', () => {
    it('should parse CSV with headers and rows correctly', () => {
      const csv = 'VendorName,Amount,Date\nAcme,1000,2025-01-15\nBeta,2000,2025-01-16';
      const { headers, rows } = parseCsvString(csv);
      expect(headers).toEqual(['VendorName', 'Amount', 'Date']);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ VendorName: 'Acme', Amount: '1000', Date: '2025-01-15' });
      expect(rows[1]).toEqual({ VendorName: 'Beta', Amount: '2000', Date: '2025-01-16' });
    });
  });

  describe('2. Parse CSV with quoted values containing commas', () => {
    it('should parse quoted fields with commas correctly', () => {
      const csv = 'Name,Amount\n"Smith, John",1000\n"Jones, Mary",2000';
      const { rows } = parseCsvString(csv);
      expect(rows[0]!.Name).toBe('Smith, John');
      expect(rows[0]!.Amount).toBe('1000');
    });
  });

  describe('3. Parse CSV with empty values', () => {
    it('should have empty string for empty cells', () => {
      const csv = 'VendorName,Amount\nAcme,1000\n,2000\nBeta,';
      const { rows } = parseCsvString(csv);
      expect(rows[1]!.VendorName).toBe('');
      expect(rows[1]!.Amount).toBe('2000');
      expect(rows[2]!.VendorName).toBe('Beta');
      expect(rows[2]!.Amount).toBe('');
    });
  });

  describe('4. CSV with only headers (no data rows)', () => {
    it('should return headers and empty rows array', () => {
      const csv = 'VendorName,Amount,Date';
      const { headers, rows } = parseCsvString(csv);
      expect(headers).toEqual(['VendorName', 'Amount', 'Date']);
      expect(rows).toEqual([]);
    });
  });

  describe('5. serializeToCsv roundtrip', () => {
    it('should roundtrip: serialize then parse back to match original', () => {
      const headers = ['VendorName', 'Amount', 'Date'];
      const rows = [
        { VendorName: 'Acme', Amount: '1000', Date: '2025-01-15' },
        { VendorName: 'Beta', Amount: '2000', Date: '2025-01-16' },
      ];
      const serialized = serializeToCsv(headers, rows);
      const parsed = parseCsvString(serialized);
      expect(parsed.headers).toEqual(headers);
      expect(parsed.rows).toEqual(rows);
    });
  });

  describe('6. withSource sets source correctly', () => {
    it('should set source on ParsedCsv', () => {
      const data: ParsedCsv = {
        headers: ['A', 'B'],
        rows: [{ A: '1', B: '2' }],
        source: 'sourceB',
      };
      const result = withSource(data, 'sourceA');
      expect(result.source).toBe('sourceA');
      expect(result.headers).toEqual(['A', 'B']);
    });
  });

  describe('7. Handle BOM in CSV', () => {
    it('should parse CSV with BOM without BOM in headers', () => {
      const bom = '\uFEFF';
      const csv = bom + 'VendorName,Amount\nAcme,1000';
      const { headers } = parseCsvString(csv);
      expect(headers[0]).toBe('VendorName');
      expect(headers[0]).not.toMatch(/\uFEFF/);
    });
  });

  describe('8. Handle whitespace in headers', () => {
    it('should parse headers with leading/trailing spaces', () => {
      const csv = '  VendorName  ,  Amount  \nAcme,1000';
      const { headers } = parseCsvString(csv);
      // PapaParse preserves spaces; we verify headers are present (trimming may be app-level)
      expect(headers).toHaveLength(2);
      expect(headers[0]!.trim()).toBe('VendorName');
      expect(headers[1]!.trim()).toBe('Amount');
    });
  });
});
