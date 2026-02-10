import type {
  ColumnMapping,
  DataSource,
  MatchingRule,
  RawCsvRow,
  Transaction,
} from '../types';

/**
 * Parse amount from string (handles commas, currency symbols, negatives).
 */
export function parseAmount(value: string): number {
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Parse date from string (ISO, DD/MM/YYYY, MM/DD/YYYY, etc.).
 */
export function parseDate(value: string): Date {
  const s = String(value ?? '').trim();
  if (!s) return new Date(NaN);
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  const [a, b, c] = s.split(/[/\-.\s]/).map((x) => parseInt(x, 10));
  if (a !== undefined && b !== undefined && c !== undefined) {
    const d = new Date(c, b - 1, a);
    if (!Number.isNaN(d.getTime())) return d;
    const d2 = new Date(a, b - 1, c);
    if (!Number.isNaN(d2.getTime())) return d2;
  }
  return new Date(NaN);
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now()}`;
}

/**
 * Derive column mapping from rules for display (amount, date, reference).
 * Uses first rule of each type: tolerance_numeric -> amount, tolerance_date -> date, exact -> reference.
 */
export function deriveColumnMappingFromRules(
  rules: MatchingRule[],
  headersA: string[],
  headersB: string[]
): { mappingA: ColumnMapping; mappingB: ColumnMapping } {
  const [first = '', second = '', third = ''] = headersA;
  const [firstB = '', secondB = '', thirdB = ''] = headersB;
  let amountA = first;
  let dateA = second;
  let refA = third;
  let amountB = firstB;
  let dateB = secondB;
  let refB = thirdB;
  for (const r of rules) {
    if (r.matchType === 'tolerance_numeric' && r.columnA && r.columnB) {
      amountA = r.columnA;
      amountB = r.columnB;
      break;
    }
  }
  for (const r of rules) {
    if (r.matchType === 'tolerance_date' && r.columnA && r.columnB) {
      dateA = r.columnA;
      dateB = r.columnB;
      break;
    }
  }
  for (const r of rules) {
    if (r.matchType === 'exact' && r.columnA && r.columnB) {
      refA = r.columnA;
      refB = r.columnB;
      break;
    }
  }
  return {
    mappingA: { amount: amountA, date: dateA, reference: refA },
    mappingB: { amount: amountB, date: dateB, reference: refB },
  };
}

/**
 * Normalize parsed CSV rows to Transaction[] using column mapping.
 */
export function normalizeToTransactions(
  rows: RawCsvRow[],
  mapping: ColumnMapping,
  source: DataSource
): Transaction[] {
  return rows.map((raw, rowIndex) => {
    const amount = parseAmount(raw[mapping.amount] ?? '');
    const date = parseDate(raw[mapping.date] ?? '');
    const reference = String(raw[mapping.reference] ?? '').trim() || `Row ${rowIndex + 1}`;
    return {
      id: nextId(source),
      source,
      amount,
      date,
      reference,
      rowIndex: rowIndex + 1,
      raw,
    };
  });
}
