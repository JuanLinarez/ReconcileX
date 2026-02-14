/**
 * Export reconciliation results to Excel (.xlsx) or CSV (.csv).
 */

import * as XLSX from 'xlsx';
import type { MatchResult, ReconciliationResult, Transaction } from '@/features/reconciliation/types';
import type { ResultsAugmentation } from './resultsAugmentation';

const DATE_FORMAT = (d: Date) =>
  Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();

function getAllRawKeys(transactions: Transaction[]): string[] {
  const keys = new Set<string>();
  for (const t of transactions) {
    for (const k of Object.keys(t.raw)) keys.add(k);
  }
  return Array.from(keys).sort();
}

function getMatchRawKeys(matched: MatchResult[]): { a: string[]; b: string[] } {
  const a = new Set<string>();
  const b = new Set<string>();
  for (const m of matched) {
    for (const t of m.transactionsA) for (const k of Object.keys(t.raw)) a.add(k);
    for (const t of m.transactionsB) for (const k of Object.keys(t.raw)) b.add(k);
  }
  return { a: Array.from(a).sort(), b: Array.from(b).sort() };
}

/** One row per (a,b) pair; optional Status + Notes when augmentation provided. */
function buildMatchedRows(
  matched: MatchResult[],
  keysA: string[],
  keysB: string[],
  manualEntries?: Array<{ match: MatchResult; note?: string }>
): (string | number)[][] {
  const hasAugmentation = manualEntries != null;
  const header: (string | number)[] = [
    'Confidence',
    'Match Type',
    ...(hasAugmentation ? ['Status', 'Notes'] : []),
    ...keysA.map((k) => `Source A — ${k}`),
    ...keysB.map((k) => `Source B — ${k}`),
  ];
  const rows: (string | number)[][] = [header];

  for (const m of matched) {
    const matchType = m.transactionsA.length === 1 && m.transactionsB.length === 1 ? '1:1' : 'Group';
    const confidencePct = (m.confidence * 100).toFixed(0) + '%';
    const aList = m.transactionsA;
    const bList = m.transactionsB;
    const len = Math.max(aList.length, bList.length, 1);
    for (let i = 0; i < len; i++) {
      const ta = aList[Math.min(i, aList.length - 1)];
      const tb = bList[Math.min(i, bList.length - 1)];
      const row: (string | number)[] = [
        confidencePct,
        matchType,
        ...(hasAugmentation ? ['Algorithm', ''] : []),
        ...keysA.map((k) => ta?.raw[k] ?? ''),
        ...keysB.map((k) => tb?.raw[k] ?? ''),
      ];
      rows.push(row);
    }
  }
  if (manualEntries) {
    for (const { match: m, note } of manualEntries) {
      const matchType = m.transactionsA.length === 1 && m.transactionsB.length === 1 ? '1:1' : 'Group';
      const aList = m.transactionsA;
      const bList = m.transactionsB;
      const len = Math.max(aList.length, bList.length, 1);
      for (let i = 0; i < len; i++) {
        const ta = aList[Math.min(i, aList.length - 1)];
        const tb = bList[Math.min(i, bList.length - 1)];
        const row: (string | number)[] = [
          '',
          matchType,
          'Manual',
          note ?? '',
          ...keysA.map((k) => ta?.raw[k] ?? ''),
          ...keysB.map((k) => tb?.raw[k] ?? ''),
        ];
        rows.push(row);
      }
    }
  }
  return rows;
}

function styleHeaderRow(ws: XLSX.WorkSheet, colCount: number): void {
  try {
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      const cell = ws[addr] as XLSX.CellObject | undefined;
      if (cell) {
        cell.s = { font: { bold: true }, fill: { fgColor: { rgb: '4472C4' } } } as XLSX.CellObject['s'];
      }
    }
  } catch {
    // xlsx community may not persist styles; ignore
  }
}

export function exportToExcel(
  result: ReconciliationResult,
  augmentation?: ResultsAugmentation
): void {
  const { matched, unmatchedA, unmatchedB } = result;
  const wb = XLSX.utils.book_new();
  const manualMatches = augmentation?.manualMatches ?? [];
  const reviewedIds = augmentation?.reviewedIds ?? new Set<string>();
  const ignoredIds = augmentation?.ignoredIds ?? new Set<string>();

  const allMatched = [...matched];
  const keysForMatched = getMatchRawKeys(
    allMatched.length ? allMatched : manualMatches.map((e) => e.match)
  );
  const { a: keysMatchedA, b: keysMatchedB } = keysForMatched;
  const matchedRows = buildMatchedRows(
    matched,
    keysMatchedA,
    keysMatchedB,
    manualMatches.length ? manualMatches : undefined
  );
  const wsMatched = XLSX.utils.aoa_to_sheet(matchedRows);
  if (matchedRows[0]) styleHeaderRow(wsMatched, matchedRows[0].length);
  XLSX.utils.book_append_sheet(wb, wsMatched, 'Matched');

  const keysA = getAllRawKeys(unmatchedA);
  const headerA = ['Status', 'Row', 'Amount', 'Date', 'Reference', ...keysA];
  const rowsA: (string | number)[][] = [headerA];
  for (const t of unmatchedA) {
    const status = reviewedIds.has(t.id) ? 'Reviewed' : ignoredIds.has(t.id) ? 'Ignored' : '';
    rowsA.push([
      status,
      t.rowIndex,
      t.amount,
      DATE_FORMAT(t.date),
      t.reference,
      ...keysA.map((k) => t.raw[k] ?? ''),
    ]);
  }
  const wsUnmatchedA = XLSX.utils.aoa_to_sheet(rowsA);
  if (rowsA[0]) styleHeaderRow(wsUnmatchedA, rowsA[0].length);
  XLSX.utils.book_append_sheet(wb, wsUnmatchedA, 'Unmatched Source A');

  const keysB = getAllRawKeys(unmatchedB);
  const headerB = ['Status', 'Row', 'Amount', 'Date', 'Reference', ...keysB];
  const rowsB: (string | number)[][] = [headerB];
  for (const t of unmatchedB) {
    const status = reviewedIds.has(t.id) ? 'Reviewed' : ignoredIds.has(t.id) ? 'Ignored' : '';
    rowsB.push([
      status,
      t.rowIndex,
      t.amount,
      DATE_FORMAT(t.date),
      t.reference,
      ...keysB.map((k) => t.raw[k] ?? ''),
    ]);
  }
  const wsUnmatchedB = XLSX.utils.aoa_to_sheet(rowsB);
  if (rowsB[0]) styleHeaderRow(wsUnmatchedB, rowsB[0].length);
  XLSX.utils.book_append_sheet(wb, wsUnmatchedB, 'Unmatched Source B');

  const totalRecordsA =
    matched.reduce((s, m) => s + m.transactionsA.length, 0) + unmatchedA.length;
  const totalRecordsB =
    matched.reduce((s, m) => s + m.transactionsB.length, 0) + unmatchedB.length;
  const totalMatchedAmount = matched.reduce(
    (s, m) => s + m.transactionsA.reduce((sum, t) => sum + t.amount, 0),
    0
  );
  const totalUnmatchedAmount =
    unmatchedA.reduce((s, t) => s + t.amount, 0) + unmatchedB.reduce((s, t) => s + t.amount, 0);
  const matchRate =
    totalRecordsA > 0
      ? ((totalRecordsA - unmatchedA.length) / totalRecordsA * 100).toFixed(1)
      : '0';

  const summaryRows: (string | number)[][] = [
    ['Metric', 'Value'],
    ['Total records Source A', totalRecordsA],
    ['Total records Source B', totalRecordsB],
    ['Total matched (pairs)', matched.length + manualMatches.length],
    ['Total unmatched A', unmatchedA.length],
    ['Total unmatched B', unmatchedB.length],
    ['Match rate %', `${matchRate}%`],
    ['Total matched amount', totalMatchedAmount],
    ['Total unmatched amount', totalUnmatchedAmount],
    ...(manualMatches.length ? [['Manual matches', manualMatches.length]] : []),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  if (summaryRows[0]) styleHeaderRow(wsSummary, 2);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `reconciliation_results_${dateStr}.xlsx`, { cellStyles: true });
}

function getDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Export matched pairs only to a single-sheet Excel file. */
export function exportMatchedOnly(
  result: ReconciliationResult,
  augmentation?: ResultsAugmentation
): void {
  const { matched } = result;
  const manualMatches = augmentation?.manualMatches ?? [];
  const wb = XLSX.utils.book_new();
  const allMatched = [...matched];
  const keysForMatched = getMatchRawKeys(
    allMatched.length ? allMatched : manualMatches.map((e) => e.match)
  );
  const { a: keysMatchedA, b: keysMatchedB } = keysForMatched;
  const matchedRows = buildMatchedRows(
    matched,
    keysMatchedA,
    keysMatchedB,
    manualMatches.length ? manualMatches : undefined
  );
  const wsMatched = XLSX.utils.aoa_to_sheet(matchedRows);
  if (matchedRows[0]) styleHeaderRow(wsMatched, matchedRows[0].length);
  XLSX.utils.book_append_sheet(wb, wsMatched, 'Matched');
  XLSX.writeFile(wb, `ReconcileX_Matched_${getDateStr()}.xlsx`, { cellStyles: true });
}

/** Export unmatched Source A only to a single-sheet Excel file. */
export function exportUnmatchedSourceA(
  result: ReconciliationResult,
  augmentation?: ResultsAugmentation
): void {
  const { unmatchedA } = result;
  const reviewedIds = augmentation?.reviewedIds ?? new Set<string>();
  const ignoredIds = augmentation?.ignoredIds ?? new Set<string>();
  const wb = XLSX.utils.book_new();
  const keysA = getAllRawKeys(unmatchedA);
  const headerA = ['Status', 'Row', 'Amount', 'Date', 'Reference', ...keysA];
  const rowsA: (string | number)[][] = [headerA];
  for (const t of unmatchedA) {
    const status = reviewedIds.has(t.id) ? 'Reviewed' : ignoredIds.has(t.id) ? 'Ignored' : '';
    rowsA.push([
      status,
      t.rowIndex,
      t.amount,
      DATE_FORMAT(t.date),
      t.reference,
      ...keysA.map((k) => t.raw[k] ?? ''),
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rowsA);
  if (rowsA[0]) styleHeaderRow(ws, rowsA[0].length);
  XLSX.utils.book_append_sheet(wb, ws, 'Unmatched Source A');
  XLSX.writeFile(wb, `ReconcileX_Unmatched_SourceA_${getDateStr()}.xlsx`, { cellStyles: true });
}

/** Export unmatched Source B only to a single-sheet Excel file. */
export function exportUnmatchedSourceB(
  result: ReconciliationResult,
  augmentation?: ResultsAugmentation
): void {
  const { unmatchedB } = result;
  const reviewedIds = augmentation?.reviewedIds ?? new Set<string>();
  const ignoredIds = augmentation?.ignoredIds ?? new Set<string>();
  const wb = XLSX.utils.book_new();
  const keysB = getAllRawKeys(unmatchedB);
  const headerB = ['Status', 'Row', 'Amount', 'Date', 'Reference', ...keysB];
  const rowsB: (string | number)[][] = [headerB];
  for (const t of unmatchedB) {
    const status = reviewedIds.has(t.id) ? 'Reviewed' : ignoredIds.has(t.id) ? 'Ignored' : '';
    rowsB.push([
      status,
      t.rowIndex,
      t.amount,
      DATE_FORMAT(t.date),
      t.reference,
      ...keysB.map((k) => t.raw[k] ?? ''),
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rowsB);
  if (rowsB[0]) styleHeaderRow(ws, rowsB[0].length);
  XLSX.utils.book_append_sheet(wb, ws, 'Unmatched Source B');
  XLSX.writeFile(wb, `ReconcileX_Unmatched_SourceB_${getDateStr()}.xlsx`, { cellStyles: true });
}

/** Export both unmatched sets into one file with a Source column indicating origin. */
export function exportAllUnmatched(
  result: ReconciliationResult,
  augmentation?: ResultsAugmentation,
  sourceAName = 'Source A',
  sourceBName = 'Source B'
): void {
  const { unmatchedA, unmatchedB } = result;
  const reviewedIds = augmentation?.reviewedIds ?? new Set<string>();
  const ignoredIds = augmentation?.ignoredIds ?? new Set<string>();
  const allKeys = new Set<string>();
  for (const t of [...unmatchedA, ...unmatchedB]) {
    for (const k of Object.keys(t.raw)) allKeys.add(k);
  }
  const keyList = Array.from(allKeys).sort();
  const header = ['Source', 'Status', 'Row', 'Amount', 'Date', 'Reference', ...keyList];
  const rows: (string | number)[][] = [header];
  for (const t of unmatchedA) {
    const status = reviewedIds.has(t.id) ? 'Reviewed' : ignoredIds.has(t.id) ? 'Ignored' : '';
    rows.push([
      sourceAName,
      status,
      t.rowIndex,
      t.amount,
      DATE_FORMAT(t.date),
      t.reference,
      ...keyList.map((k) => t.raw[k] ?? ''),
    ]);
  }
  for (const t of unmatchedB) {
    const status = reviewedIds.has(t.id) ? 'Reviewed' : ignoredIds.has(t.id) ? 'Ignored' : '';
    rows.push([
      sourceBName,
      status,
      t.rowIndex,
      t.amount,
      DATE_FORMAT(t.date),
      t.reference,
      ...keyList.map((k) => t.raw[k] ?? ''),
    ]);
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (rows[0]) styleHeaderRow(ws, rows[0].length);
  XLSX.utils.book_append_sheet(wb, ws, 'All Unmatched');
  XLSX.writeFile(wb, `ReconcileX_All_Unmatched_${getDateStr()}.xlsx`, { cellStyles: true });
}

function escapeCsv(val: unknown): string {
  if (val == null) return '';
  const s = String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportToCsv(
  result: ReconciliationResult,
  augmentation?: ResultsAugmentation
): void {
  const { matched, unmatchedA, unmatchedB } = result;
  const manualMatches = augmentation?.manualMatches ?? [];
  const reviewedIds = augmentation?.reviewedIds ?? new Set<string>();
  const ignoredIds = augmentation?.ignoredIds ?? new Set<string>();

  const allKeys = new Set<string>();
  for (const t of [...unmatchedA, ...unmatchedB]) {
    for (const k of Object.keys(t.raw)) allKeys.add(k);
  }
  for (const m of matched) {
    for (const t of [...m.transactionsA, ...m.transactionsB]) {
      for (const k of Object.keys(t.raw)) allKeys.add(k);
    }
  }
  for (const { match: m } of manualMatches) {
    for (const t of [...m.transactionsA, ...m.transactionsB]) {
      for (const k of Object.keys(t.raw)) allKeys.add(k);
    }
  }
  const keyList = Array.from(allKeys).sort();
  const headers = [
    'Status',
    'Action',
    'Confidence',
    'Notes',
    'Row',
    'Amount',
    'Date',
    'Reference',
    ...keyList,
  ];

  const rows: (string | number)[][] = [headers];

  for (const m of matched) {
    const aList = m.transactionsA;
    const bList = m.transactionsB;
    const len = Math.max(aList.length, bList.length, 1);
    for (let i = 0; i < len; i++) {
      const ta = aList[Math.min(i, aList.length - 1)];
      const tb = bList[Math.min(i, bList.length - 1)];
      const confidence = (m.confidence * 100).toFixed(1) + '%';
      rows.push([
        'Matched',
        'Algorithm',
        confidence,
        '',
        ta?.rowIndex ?? tb?.rowIndex ?? '',
        ta?.amount ?? tb?.amount ?? '',
        ta ? DATE_FORMAT(ta.date) : (tb ? DATE_FORMAT(tb.date) : ''),
        ta?.reference ?? tb?.reference ?? '',
        ...keyList.map((k) => {
          const va = ta?.raw[k] ?? '';
          const vb = tb?.raw[k] ?? '';
          return va || vb;
        }),
      ]);
    }
  }

  for (const { match: m, note } of manualMatches) {
    const aList = m.transactionsA;
    const bList = m.transactionsB;
    const len = Math.max(aList.length, bList.length, 1);
    for (let i = 0; i < len; i++) {
      const ta = aList[Math.min(i, aList.length - 1)];
      const tb = bList[Math.min(i, bList.length - 1)];
      rows.push([
        'Matched',
        'Manual',
        '',
        note ?? '',
        ta?.rowIndex ?? tb?.rowIndex ?? '',
        ta?.amount ?? tb?.amount ?? '',
        ta ? DATE_FORMAT(ta.date) : (tb ? DATE_FORMAT(tb.date) : ''),
        ta?.reference ?? tb?.reference ?? '',
        ...keyList.map((k) => {
          const va = ta?.raw[k] ?? '';
          const vb = tb?.raw[k] ?? '';
          return va || vb;
        }),
      ]);
    }
  }

  for (const t of unmatchedA) {
    const action = reviewedIds.has(t.id) ? 'Reviewed' : ignoredIds.has(t.id) ? 'Ignored' : '';
    rows.push([
      'Unmatched A',
      action,
      '',
      '',
      t.rowIndex,
      t.amount,
      DATE_FORMAT(t.date),
      t.reference,
      ...keyList.map((k) => t.raw[k] ?? ''),
    ]);
  }

  for (const t of unmatchedB) {
    const action = reviewedIds.has(t.id) ? 'Reviewed' : ignoredIds.has(t.id) ? 'Ignored' : '';
    rows.push([
      'Unmatched B',
      action,
      '',
      '',
      t.rowIndex,
      t.amount,
      DATE_FORMAT(t.date),
      t.reference,
      ...keyList.map((k) => t.raw[k] ?? ''),
    ]);
  }

  const csvContent = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reconciliation_results_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
