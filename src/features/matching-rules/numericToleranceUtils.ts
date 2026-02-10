import { parseAmount } from '@/features/reconciliation/utils/normalize';
import type { RawCsvRow } from '@/features/reconciliation/types';

/**
 * Compute max value for the "fixed amount" tolerance slider: 1% of the largest
 * absolute value in the two columns, minimum 100.
 */
export function getMaxFixedTolerance(
  rowsA: RawCsvRow[],
  rowsB: RawCsvRow[],
  columnA: string,
  columnB: string
): number {
  let maxAbs = 0;
  for (const row of rowsA) {
    const v = parseAmount(row[columnA] ?? '');
    const abs = Math.abs(v);
    if (Number.isFinite(abs)) maxAbs = Math.max(maxAbs, abs);
  }
  for (const row of rowsB) {
    const v = parseAmount(row[columnB] ?? '');
    const abs = Math.abs(v);
    if (Number.isFinite(abs)) maxAbs = Math.max(maxAbs, abs);
  }
  const onePct = maxAbs * 0.01;
  return Math.max(100, onePct);
}
