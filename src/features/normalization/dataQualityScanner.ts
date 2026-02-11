/**
 * Client-side data quality scanner. Detects issues without calling AI.
 * Runs instantly in the browser.
 */

import type { ParsedCsv } from '@/features/reconciliation/types';
import { normalizedSimilarity } from '@/features/reconciliation/utils/levenshtein';

export type IssueType =
  | 'inconsistent_date_format'
  | 'inconsistent_amount_format'
  | 'vendor_name_variations'
  | 'leading_trailing_whitespace'
  | 'mixed_case'
  | 'special_characters_in_reference'
  | 'empty_values'
  | 'duplicate_rows';

export interface DataQualityIssue {
  id: string;
  type: IssueType;
  severity: 'high' | 'medium' | 'low';
  column: string;
  description: string;
  affectedRows: number[];
  suggestedFix: string;
  autoFixable: boolean;
}

export interface ScanResult {
  sourceA: DataQualityIssue[];
  sourceB: DataQualityIssue[];
  totalIssues: number;
  needsAiNormalization: boolean;
}

function makeId(type: IssueType, column: string): string {
  return `issue-${type}-${column.replace(/\s+/g, '_')}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function detectWhitespace(source: ParsedCsv): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  for (const col of source.headers) {
    const affectedRows: number[] = [];
    for (let i = 0; i < source.rows.length; i++) {
      const val = source.rows[i][col] ?? '';
      if (val !== val.trim() && val.length > 0) {
        affectedRows.push(i);
      }
    }
    if (affectedRows.length > 0) {
      issues.push({
        id: makeId('leading_trailing_whitespace', col),
        type: 'leading_trailing_whitespace',
        severity: 'low',
        column: col,
        description: `${affectedRows.length} row(s) have leading or trailing whitespace`,
        affectedRows,
        suggestedFix: 'Trim whitespace',
        autoFixable: true,
      });
    }
  }
  return issues;
}

function detectEmptyValues(
  sourceA: ParsedCsv,
  sourceB: ParsedCsv
): { issuesA: DataQualityIssue[]; issuesB: DataQualityIssue[] } {
  const issuesA: DataQualityIssue[] = [];
  const issuesB: DataQualityIssue[] = [];

  for (const col of sourceA.headers) {
    const total = sourceA.rows.length;
    if (total === 0) continue;
    const emptyRows: number[] = [];
    for (let i = 0; i < sourceA.rows.length; i++) {
      const val = sourceA.rows[i][col];
      if (val == null || String(val).trim() === '') emptyRows.push(i);
    }
    const emptyPct = emptyRows.length / total;
    const otherHasData = sourceB.headers.includes(col) && sourceB.rows.some((r) => {
      const v = r[col];
      return v != null && String(v).trim() !== '';
    });
    if (emptyPct > 0.1 && otherHasData && emptyRows.length > 0) {
      issuesA.push({
        id: makeId('empty_values', col),
        type: 'empty_values',
        severity: 'medium',
        column: col,
        description: `${emptyRows.length} row(s) (${Math.round(emptyPct * 100)}%) have empty values in "${col}"`,
        affectedRows: emptyRows,
        suggestedFix: 'Fill or remove empty values',
        autoFixable: false,
      });
    }
  }

  for (const col of sourceB.headers) {
    const total = sourceB.rows.length;
    if (total === 0) continue;
    const emptyRows: number[] = [];
    for (let i = 0; i < sourceB.rows.length; i++) {
      const val = sourceB.rows[i][col];
      if (val == null || String(val).trim() === '') emptyRows.push(i);
    }
    const emptyPct = emptyRows.length / total;
    const otherHasData = sourceA.headers.includes(col) && sourceA.rows.some((r) => {
      const v = r[col];
      return v != null && String(v).trim() !== '';
    });
    if (emptyPct > 0.1 && otherHasData && emptyRows.length > 0) {
      issuesB.push({
        id: makeId('empty_values', col) + '-b',
        type: 'empty_values',
        severity: 'medium',
        column: col,
        description: `${emptyRows.length} row(s) (${Math.round(emptyPct * 100)}%) have empty values in "${col}"`,
        affectedRows: emptyRows,
        suggestedFix: 'Fill or remove empty values',
        autoFixable: false,
      });
    }
  }
  return { issuesA, issuesB };
}

const DATE_PATTERNS = {
  iso: /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
  us: /^\d{1,2}\/\d{1,2}\/\d{4}$/, // MM/DD/YYYY or M/D/YYYY
  eu: /^\d{1,2}\.\d{1,2}\.\d{4}$|^\d{1,2}-\d{1,2}-\d{4}$/, // DD.MM.YYYY or DD-MM-YYYY
};

function parseDateFormat(val: string): 'iso' | 'us' | 'eu' | null {
  const trimmed = String(val).trim();
  if (!trimmed) return null;
  if (DATE_PATTERNS.iso.test(trimmed)) return 'iso';
  if (DATE_PATTERNS.us.test(trimmed)) return 'us';
  if (DATE_PATTERNS.eu.test(trimmed)) return 'eu';
  return null;
}

function isDateLikeColumn(name: string): boolean {
  const lower = name.toLowerCase();
  return /date|dt|posted|transaction|created|updated/.test(lower);
}

function detectInconsistentDateFormats(source: ParsedCsv): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  for (const col of source.headers) {
    if (!isDateLikeColumn(col)) continue;

    const formats = new Map<string, number[]>();
    for (let i = 0; i < source.rows.length; i++) {
      const val = source.rows[i][col];
      if (val == null || String(val).trim() === '') continue;
      const fmt = parseDateFormat(String(val));
      if (fmt) {
        const rows = formats.get(fmt) ?? [];
        rows.push(i);
        formats.set(fmt, rows);
      }
    }
    if (formats.size > 1) {
      const allAffected = Array.from(formats.values()).flat();
      issues.push({
        id: makeId('inconsistent_date_format', col),
        type: 'inconsistent_date_format',
        severity: 'high',
        column: col,
        description: `Mixed date formats (${Array.from(formats.keys()).join(', ')}) in same column`,
        affectedRows: allAffected,
        suggestedFix: 'Normalize to a single date format (AI recommended)',
        autoFixable: false,
      });
    }
  }
  return issues;
}

function isAmountLikeColumn(name: string): boolean {
  const lower = name.toLowerCase();
  return /amount|amt|sum|total|value|balance|credit|debit|price/.test(lower);
}

function detectInconsistentAmountFormats(source: ParsedCsv): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  for (const col of source.headers) {
    if (!isAmountLikeColumn(col)) continue;

    const withCurrency: number[] = [];
    const withoutCurrency: number[] = [];
    const withComma: number[] = [];
    const withParens: number[] = [];

    for (let i = 0; i < source.rows.length; i++) {
      const val = String(source.rows[i][col] ?? '').trim();
      if (!val || !/[\d,.\-()$€£]/.test(val)) continue;

      if (/[$€£]/.test(val)) withCurrency.push(i);
      else withoutCurrency.push(i);
      if (/,\d{3}|,\d{2}$/.test(val)) withComma.push(i);
      if (/\(\s*\d+[\d,.]*\s*\)/.test(val)) withParens.push(i);
    }

    const formatsMixed =
      (withCurrency.length > 0 && withoutCurrency.length > 0) ||
      withComma.length > 0 ||
      withParens.length > 0;
    const affectedRows = [...new Set([...withCurrency, ...withoutCurrency, ...withComma, ...withParens])];
    if (formatsMixed && affectedRows.length > 0) {
      issues.push({
        id: makeId('inconsistent_amount_format', col),
        type: 'inconsistent_amount_format',
        severity: 'medium',
        column: col,
        description: `Mixed amount formats (currency symbols, separators, or negative notation)`,
        affectedRows,
        suggestedFix: 'Normalize: remove $/€/£, standardize decimals',
        autoFixable: true,
      });
    }
  }
  return issues;
}

function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectVendorNameVariations(
  sourceA: ParsedCsv,
  sourceB: ParsedCsv
): { issuesA: DataQualityIssue[]; issuesB: DataQualityIssue[] } {
  const issuesA: DataQualityIssue[] = [];
  const issuesB: DataQualityIssue[] = [];
  const refLikeColumns = [...new Set([...sourceA.headers, ...sourceB.headers])].filter((h) => {
    const l = h.toLowerCase();
    return /reference|ref|vendor|description|name|payee|merchant/.test(l);
  });

  for (const col of refLikeColumns) {
    const valuesA = sourceA.headers.includes(col)
      ? sourceA.rows.map((r, i) => ({ raw: String(r[col] ?? '').trim(), rowIndex: i }))
      : [];
    const valuesB = sourceB.headers.includes(col)
      ? sourceB.rows.map((r, i) => ({ raw: String(r[col] ?? '').trim(), rowIndex: i }))
      : [];

    const allValues = [...valuesA, ...valuesB].filter((v) => v.raw.length > 2);
    if (allValues.length < 2) continue;

    const groups: Set<string>[] = [];
    const used = new Set<number>();

    for (let i = 0; i < allValues.length; i++) {
      if (used.has(i)) continue;
      const normI = normalizeForComparison(allValues[i].raw);
      const group = new Set<string>([allValues[i].raw]);
      used.add(i);

      for (let j = i + 1; j < allValues.length; j++) {
        if (used.has(j)) continue;
        const normJ = normalizeForComparison(allValues[j].raw);
        const sim = normalizedSimilarity(normI, normJ);
        if (sim >= 0.7 && normI !== normJ) {
          group.add(allValues[j].raw);
          used.add(j);
        }
      }
      if (group.size > 1) {
        groups.push(group);
      }
    }

    if (groups.length > 0) {
      const variantStrings = new Set<string>();
      for (const g of groups) {
        for (const s of g) variantStrings.add(s);
      }
      const affectedA = valuesA.filter((v) => variantStrings.has(v.raw)).map((v) => v.rowIndex);
      const affectedB = valuesB.filter((v) => variantStrings.has(v.raw)).map((v) => v.rowIndex);

      if (affectedA.length > 0 && sourceA.headers.includes(col)) {
        issuesA.push({
          id: makeId('vendor_name_variations', col),
          type: 'vendor_name_variations',
          severity: 'high',
          column: col,
          description: `Found ${groups.length} group(s) of similar strings that may represent the same entity`,
          affectedRows: affectedA,
          suggestedFix: 'Normalize vendor/entity names (AI recommended)',
          autoFixable: false,
        });
      }
      if (affectedB.length > 0 && sourceB.headers.includes(col)) {
        issuesB.push({
          id: makeId('vendor_name_variations', col) + '-b',
          type: 'vendor_name_variations',
          severity: 'high',
          column: col,
          description: `Found ${groups.length} group(s) of similar strings that may represent the same entity`,
          affectedRows: affectedB,
          suggestedFix: 'Normalize vendor/entity names (AI recommended)',
          autoFixable: false,
        });
      }
    }
  }
  return { issuesA, issuesB };
}

function detectMixedCase(source: ParsedCsv): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  for (const col of source.headers) {
    const variants = new Map<string, number[]>();
    for (let i = 0; i < source.rows.length; i++) {
      const val = String(source.rows[i][col] ?? '').trim();
      if (val.length < 2) continue;
      const key = val.toLowerCase();
      const rows = variants.get(key) ?? [];
      rows.push(i);
      variants.set(key, rows);
    }
    const distinctForms = new Set<string>();
    for (const [, rows] of variants) {
      for (const ri of rows) {
        distinctForms.add(source.rows[ri][col] ?? '');
      }
    }
    if (distinctForms.size > 1) {
      const affectedRows = Array.from(variants.values()).flat();
      issues.push({
        id: makeId('mixed_case', col),
        type: 'mixed_case',
        severity: 'low',
        column: col,
        description: `Multiple case variants (e.g. "ACME Corp" vs "acme corp")`,
        affectedRows,
        suggestedFix: 'Normalize to Title Case',
        autoFixable: true,
      });
    }
  }
  return issues;
}

function detectSpecialCharsInReference(source: ParsedCsv): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const refLike = source.headers.filter((h) => {
    const l = h.toLowerCase();
    return /reference|ref|invoice|number|id/.test(l);
  });
  const specialRe = /[^\w\s\-.\/]/;
  for (const col of refLike) {
    const affectedRows: number[] = [];
    for (let i = 0; i < source.rows.length; i++) {
      const val = String(source.rows[i][col] ?? '');
      if (val && specialRe.test(val)) affectedRows.push(i);
    }
    if (affectedRows.length > 0) {
      issues.push({
        id: makeId('special_characters_in_reference', col),
        type: 'special_characters_in_reference',
        severity: 'medium',
        column: col,
        description: `${affectedRows.length} row(s) have special characters in reference`,
        affectedRows,
        suggestedFix: 'Remove or standardize special characters',
        autoFixable: false,
      });
    }
  }
  return issues;
}

function detectDuplicateRows(source: ParsedCsv): DataQualityIssue[] {
  const seen = new Map<string, number[]>();
  for (let i = 0; i < source.rows.length; i++) {
    const key = JSON.stringify(source.rows[i]);
    const rows = seen.get(key) ?? [];
    rows.push(i);
    seen.set(key, rows);
  }
  const duplicateGroups = Array.from(seen.values()).filter((rows) => rows.length > 1);
  if (duplicateGroups.length === 0) return [];

  const affectedRows = duplicateGroups.flat();
  return [
    {
      id: makeId('duplicate_rows', 'all'),
      type: 'duplicate_rows',
      severity: 'high',
      column: 'all',
      description: `${affectedRows.length} row(s) are exact duplicates`,
      affectedRows,
      suggestedFix: 'Remove duplicates',
      autoFixable: true,
    },
  ];
}

export function scanDataQuality(sourceA: ParsedCsv, sourceB: ParsedCsv): ScanResult {
  const issuesA: DataQualityIssue[] = [];
  const issuesB: DataQualityIssue[] = [];

  issuesA.push(...detectWhitespace(sourceA));
  issuesB.push(...detectWhitespace(sourceB));

  const { issuesA: emptyA, issuesB: emptyB } = detectEmptyValues(sourceA, sourceB);
  issuesA.push(...emptyA);
  issuesB.push(...emptyB);

  issuesA.push(...detectInconsistentDateFormats(sourceA));
  issuesB.push(...detectInconsistentDateFormats(sourceB));

  issuesA.push(...detectInconsistentAmountFormats(sourceA));
  issuesB.push(...detectInconsistentAmountFormats(sourceB));

  const { issuesA: vendorA, issuesB: vendorB } = detectVendorNameVariations(sourceA, sourceB);
  issuesA.push(...vendorA);
  issuesB.push(...vendorB);

  issuesA.push(...detectMixedCase(sourceA));
  issuesB.push(...detectMixedCase(sourceB));

  issuesA.push(...detectSpecialCharsInReference(sourceA));
  issuesB.push(...detectSpecialCharsInReference(sourceB));

  issuesA.push(...detectDuplicateRows(sourceA));
  issuesB.push(...detectDuplicateRows(sourceB));

  const allIssues = [...issuesA, ...issuesB];
  const needsAi = allIssues.some(
    (i) =>
      !i.autoFixable &&
      ['inconsistent_date_format', 'vendor_name_variations', 'empty_values', 'special_characters_in_reference'].includes(
        i.type
      )
  );

  return {
    sourceA: issuesA,
    sourceB: issuesB,
    totalIssues: allIssues.length,
    needsAiNormalization: needsAi,
  };
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(?:^|\s)\w/g, (m) => m.toUpperCase());
}

function normalizeAmountValue(val: string): string {
  let s = val.replace(/[$€£\s]/g, '').trim();
  if (/\([^)]*\d+[^)]*\)/.test(s)) {
    s = '-' + s.replace(/[()]/g, '');
  }
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts[parts.length - 1].length === 3) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  }
  return s;
}

export function applyAutoFix(source: ParsedCsv, issues: DataQualityIssue[]): ParsedCsv {
  const autoFixable = issues.filter((i) => i.autoFixable);
  if (autoFixable.length === 0) {
    return { ...source, rows: source.rows.map((r) => ({ ...r })) };
  }

  let rows = source.rows.map((r) => ({ ...r }));

  for (const issue of autoFixable) {
    if (issue.type === 'leading_trailing_whitespace') {
      for (const row of rows) {
        if (issue.column in row) {
          row[issue.column] = String(row[issue.column] ?? '').trim();
        }
      }
    }

    if (issue.type === 'inconsistent_amount_format' && isAmountLikeColumn(issue.column)) {
      for (const row of rows) {
        if (issue.column in row) {
          row[issue.column] = normalizeAmountValue(String(row[issue.column] ?? ''));
        }
      }
    }

    if (issue.type === 'mixed_case') {
      for (const row of rows) {
        if (issue.column in row) {
          const val = String(row[issue.column] ?? '');
          if (val) row[issue.column] = toTitleCase(val);
        }
      }
    }

    if (issue.type === 'duplicate_rows') {
      const seen = new Set<string>();
      rows = rows.filter((row) => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }

  return { ...source, rows };
}
