import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { DataSource } from '../types';
import type { ParsedCsv, RawCsvRow } from '../types';

export type ParseFileResult =
  | { success: true; data: ParsedCsv }
  | { success: false; error: string };

const EXCEL_EXTENSIONS = /\.(xlsx|xls)$/i;

function isExcelFile(file: File): boolean {
  return EXCEL_EXTENSIONS.test(file.name);
}

/**
 * Parse a CSV file into headers and rows.
 */
export function parseCsvFile(file: File, source: DataSource): Promise<ParseFileResult> {
  return new Promise((resolve) => {
    Papa.parse<RawCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete(results) {
        if (results.errors.length > 0) {
          const first = results.errors[0];
          resolve({
            success: false,
            error: first?.message ?? 'Failed to parse CSV',
          });
          return;
        }
        const rows = results.data as RawCsvRow[];
        const headers = results.meta.fields ?? (rows[0] ? Object.keys(rows[0]) : []);
        resolve({
          success: true,
          data: {
            headers,
            rows,
            source,
            filename: file.name,
            fileType: 'csv',
          },
        });
      },
    });
  });
}

/**
 * Convert a cell value from xlsx to string for RawCsvRow.
 */
function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Parse an Excel file (.xlsx, .xls) first sheet into headers and rows (same shape as PapaParse).
 */
export function parseExcelFile(file: File, source: DataSource): Promise<ParseFileResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data || !(data instanceof ArrayBuffer)) {
          resolve({ success: false, error: 'Failed to read file' });
          return;
        }
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve({ success: false, error: 'Workbook has no sheets' });
          return;
        }
        const sheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
        if (jsonRows.length === 0) {
          resolve({
            success: true,
            data: {
              headers: [],
              rows: [],
              source,
              filename: file.name,
              fileType: 'excel',
            },
          });
          return;
        }
        const headers = Object.keys(jsonRows[0]);
        const rows: RawCsvRow[] = jsonRows.map((row) => {
          const out: RawCsvRow = {};
          for (const h of headers) {
            out[h] = cellToString(row[h]);
          }
          return out;
        });
        resolve({
          success: true,
          data: {
            headers,
            rows,
            source,
            filename: file.name,
            fileType: 'excel',
          },
        });
      } catch (err) {
        resolve({
          success: false,
          error: err instanceof Error ? err.message : 'Failed to parse Excel file',
        });
      }
    };
    reader.onerror = () => resolve({ success: false, error: 'Failed to read file' });
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse a CSV or Excel file; returns same ParsedCsv shape for both.
 */
export function parseSourceFile(file: File, source: DataSource): Promise<ParseFileResult> {
  if (isExcelFile(file)) return parseExcelFile(file, source);
  return parseCsvFile(file, source);
}

/**
 * Return a copy of ParsedCsv with the given source (e.g. when assigning selected pair to sourceA/sourceB).
 */
export function withSource(data: ParsedCsv, source: DataSource): ParsedCsv {
  return { ...data, source };
}

/**
 * Re-serialize parsed CSV data back to CSV text string.
 * RFC 4180 compliant: quotes fields containing comma, quote, or newline.
 * Used to send data to server-side matching as compact CSV instead of verbose JSON.
 */
export function serializeToCsv(headers: string[], rows: Record<string, string>[]): string {
  const escapeField = (field: string): string => {
    if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
      return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
  };

  const headerLine = headers.map(escapeField).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escapeField(row[h] ?? '')).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}
