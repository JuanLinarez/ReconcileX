import type { MatchingRule } from '@/features/reconciliation/types';

let ruleIdCounter = 0;
export function nextRuleId(): string {
  ruleIdCounter += 1;
  return `rule-${ruleIdCounter}-${Date.now()}`;
}

/** Find best column for amount/date/reference by name. */
function findColumn(headers: string[], patterns: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  for (const p of patterns) {
    const i = lower.findIndex((h) => h.includes(p));
    if (i >= 0) return headers[i];
  }
  return headers[0] ?? '';
}

/**
 * Pre-populate matching rules from column names (amount, date, reference hints).
 */
export function getDefaultRules(headersA: string[], headersB: string[]): MatchingRule[] {
  const amountA = findColumn(headersA, ['amount', 'amt', 'sum', 'total', 'value']);
  const amountB = findColumn(headersB, ['amount', 'amt', 'sum', 'total', 'value']);
  const dateA = findColumn(headersA, ['date', 'dt', 'posted', 'transaction date']);
  const dateB = findColumn(headersB, ['date', 'dt', 'posted', 'transaction date']);
  const refA = findColumn(headersA, ['ref', 'reference', 'ref#', 'refno', 'id', 'description']);
  const refB = findColumn(headersB, ['ref', 'reference', 'ref#', 'refno', 'id', 'description']);

  const rules: MatchingRule[] = [];
  if (amountA && amountB) {
    rules.push({
      id: nextRuleId(),
      columnA: amountA,
      columnB: amountB,
      matchType: 'tolerance_numeric',
      toleranceNumericMode: 'percentage',
      toleranceValue: 0.005,
      weight: 1,
    });
  }
  if (dateA && dateB) {
    rules.push({
      id: nextRuleId(),
      columnA: dateA,
      columnB: dateB,
      matchType: 'tolerance_date',
      toleranceValue: 3,
      weight: 1,
    });
  }
  if (refA && refB) {
    rules.push({
      id: nextRuleId(),
      columnA: refA,
      columnB: refB,
      matchType: 'exact',
      weight: 1,
    });
  }
  if (rules.length === 0 && headersA[0] && headersB[0]) {
    rules.push({
      id: nextRuleId(),
      columnA: headersA[0],
      columnB: headersB[0],
      matchType: 'exact',
      weight: 1,
    });
  }
  const n = rules.length;
  if (n > 0) {
    const equalWeight = 1 / n;
    for (const r of rules) r.weight = equalWeight;
  }
  return rules;
}
