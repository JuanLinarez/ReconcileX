/**
 * Client-side anomaly detection for reconciliation results.
 * Scans matched and unmatched transactions for suspicious patterns.
 * No API calls — runs entirely in the browser.
 */

import type { ReconciliationResult, Transaction } from '@/features/reconciliation/types';
import { normalizedSimilarity } from '@/features/reconciliation/utils/levenshtein';

export type AnomalyType =
  | 'duplicate_payment'
  | 'round_amount'
  | 'threshold_splitting'
  | 'unusual_amount'
  | 'weekend_transaction'
  | 'duplicate_reference'
  | 'amount_mismatch_pattern'
  | 'stale_unmatched';

export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  description: string;
  affectedTransactions: Array<{
    id: string;
    source: 'sourceA' | 'sourceB';
    amount: number;
    date: Date;
    reference: string;
    rowIndex: number;
  }>;
  riskScore: number;
  recommendedAction: string;
}

export interface AnomalyReport {
  anomalies: Anomaly[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    totalRiskScore: number;
  };
  scannedAt: Date;
}

type DataSource = 'sourceA' | 'sourceB';

function toDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function getReference(t: Transaction): string {
  return String(t.reference ?? t.raw?.reference ?? '').trim();
}

function getVendorOrReference(t: Transaction): string {
  const raw = t.raw ?? {};
  const candidates = [
    raw['VendorName'],
    raw['PayeeName'],
    raw['Payee'],
    raw['Vendor'],
    raw['Customer'],
    raw['Company'],
    raw['Name'],
    t.reference,
    raw['reference'],
  ];
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return getReference(t);
}

function toAffected(t: Transaction): Anomaly['affectedTransactions'][0] {
  return {
    id: t.id,
    source: t.source,
    amount: t.amount,
    date: toDate(t.date),
    reference: getReference(t),
    rowIndex: t.rowIndex,
  };
}

function allTransactions(result: ReconciliationResult): Transaction[] {
  const out: Transaction[] = [];
  for (const m of result.matched) {
    out.push(...m.transactionsA, ...m.transactionsB);
  }
  out.push(...result.unmatchedA, ...result.unmatchedB);
  return out;
}

function genId(type: AnomalyType, index: number): string {
  return `anomaly-${type}-${index}-${Date.now()}`;
}

/** 1. Duplicate Payment: two matched pairs with same amount + similar reference (>80%). */
function detectDuplicatePayments(result: ReconciliationResult): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const matched = result.matched;
  for (let i = 0; i < matched.length; i++) {
    for (let j = i + 1; j < matched.length; j++) {
      const mA = matched[i];
      const mB = matched[j];
      const amtA = mA.transactionsA.reduce((s, t) => s + t.amount, 0);
      const amtB = mB.transactionsA.reduce((s, t) => s + t.amount, 0);
      if (Math.abs(amtA - amtB) > 0.01) continue;
      const refA = getVendorOrReference(mA.transactionsA[0]!);
      const refB = getVendorOrReference(mB.transactionsA[0]!);
      if (!refA || !refB) continue;
      if (normalizedSimilarity(refA, refB) <= 0.8) continue;
      const affected = [
        ...mA.transactionsA,
        ...mA.transactionsB,
        ...mB.transactionsA,
        ...mB.transactionsB,
      ].map(toAffected);
      anomalies.push({
        id: genId('duplicate_payment', anomalies.length),
        type: 'duplicate_payment',
        severity: 'critical',
        title: 'Potential duplicate payment',
        description: `Two matched pairs share the same amount ($${amtA.toFixed(2)}) and similar vendor/reference.`,
        affectedTransactions: affected,
        riskScore: 90,
        recommendedAction: 'Verify that these are not duplicate payments. Check for duplicate invoices or vendor records.',
      });
    }
  }
  return anomalies;
}

/** 2. Round Amount: unmatched transactions with round amounts >= $5,000. */
function detectRoundAmounts(result: ReconciliationResult): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const all = [...result.unmatchedA, ...result.unmatchedB];
  for (const t of all) {
    const amt = Math.abs(t.amount);
    if (amt < 5000) continue;
    if (Math.abs(amt % 1000) > 0.01) continue;
    anomalies.push({
      id: genId('round_amount', anomalies.length),
      type: 'round_amount',
      severity: 'medium',
      title: 'Suspicious round amount',
      description: `Row ${t.rowIndex} has a perfectly round amount of $${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
      affectedTransactions: [toAffected(t)],
      riskScore: 40,
      recommendedAction: 'Round amounts may indicate estimates or fraudulent entries. Verify authenticity.',
    });
  }
  return anomalies;
}

/** 3. Threshold Splitting: 2+ transactions from same reference within 7 days, each $4,500–4,999 or $9,500–9,999. */
function detectThresholdSplitting(result: ReconciliationResult): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const all = [...result.unmatchedA, ...result.unmatchedB];
  const byRef = new Map<string, Transaction[]>();
  for (const t of all) {
    const ref = getReference(t) || `_row_${t.rowIndex}`;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref)!.push(t);
  }
  const inBand = (amt: number) =>
    (amt >= 4500 && amt <= 4999) || (amt >= 9500 && amt <= 9999);
  const within7Days = (d1: Date, d2: Date) =>
    Math.abs(d1.getTime() - d2.getTime()) <= 7 * 24 * 60 * 60 * 1000;
  for (const [ref, txs] of byRef) {
    if (txs.length < 2) continue;
    const candidates = txs.filter((t) => inBand(Math.abs(t.amount)));
    if (candidates.length < 2) continue;
    let found = false;
    for (let i = 0; i < candidates.length && !found; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        if (!within7Days(toDate(candidates[i]!.date), toDate(candidates[j]!.date))) continue;
        anomalies.push({
          id: genId('threshold_splitting', anomalies.length),
          type: 'threshold_splitting',
          severity: 'high',
          title: 'Possible threshold splitting',
          description: `Multiple transactions from the same reference (${ref || 'unknown'}) are just below approval thresholds.`,
          affectedTransactions: candidates.map(toAffected),
          riskScore: 75,
          recommendedAction: 'Review for possible splitting to avoid approval limits. Consider consolidating or escalating.',
        });
        found = true;
        break;
      }
    }
  }
  return anomalies;
}

/** 4. Unusual Amount: matched pair amount > 3 std devs from mean. */
function detectUnusualAmounts(result: ReconciliationResult): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const matched = result.matched;
  if (matched.length < 3) return [];
  const amounts = matched.map((m) =>
    m.transactionsA.reduce((s, t) => s + t.amount, 0)
  );
  const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  const variance =
    amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
  const std = Math.sqrt(variance) || 0.0001;
  for (let i = 0; i < matched.length; i++) {
    const amt = amounts[i]!;
    if (Math.abs(amt - mean) <= 3 * std) continue;
    const m = matched[i]!;
    const affected = [...m.transactionsA, ...m.transactionsB].map(toAffected);
    anomalies.push({
      id: genId('unusual_amount', anomalies.length),
      type: 'unusual_amount',
      severity: 'medium',
      title: 'Statistically unusual amount',
      description: `This matched pair's amount ($${amt.toFixed(2)}) is more than 3 standard deviations from the mean.`,
      affectedTransactions: affected,
      riskScore: 50,
      recommendedAction: 'Verify this transaction is legitimate. Unusual amounts may warrant additional review.',
    });
  }
  return anomalies;
}

/** 5. Weekend Transaction: transactions on Sat/Sun. Flag if > 2. */
function detectWeekendTransactions(result: ReconciliationResult): Anomaly[] {
  const all = allTransactions(result);
  const weekend = all.filter((t) => {
    const d = toDate(t.date);
    const day = d.getDay();
    return day === 0 || day === 6;
  });
  if (weekend.length <= 2) return [];
  return [
    {
      id: genId('weekend_transaction', 0),
      type: 'weekend_transaction',
      severity: 'low',
      title: 'Weekend transactions detected',
      description: `${weekend.length} transactions are dated on Saturday or Sunday. Unusual for B2B.`,
      affectedTransactions: weekend.map(toAffected),
      riskScore: 20,
      recommendedAction: 'Review weekend-dated transactions for validity.',
    },
  ];
}

/** 6. Duplicate Reference: same reference appears more than once within a source. */
function detectDuplicateReferences(result: ReconciliationResult): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const check = (txs: Transaction[], source: DataSource) => {
    const byRef = new Map<string, Transaction[]>();
    for (const t of txs) {
      const ref = getReference(t);
      if (!ref) continue;
      if (!byRef.has(ref)) byRef.set(ref, []);
      byRef.get(ref)!.push(t);
    }
    for (const [ref, list] of byRef) {
      if (list.length < 2) continue;
      anomalies.push({
        id: genId('duplicate_reference', anomalies.length),
        type: 'duplicate_reference',
        severity: 'high',
        title: 'Duplicate reference',
        description: `Reference "${ref}" appears ${list.length} times in ${source === 'sourceA' ? 'Source A' : 'Source B'}.`,
        affectedTransactions: list.map(toAffected),
        riskScore: 70,
        recommendedAction: 'Check for double entry or duplicate invoices.',
      });
    }
  };
  const allA = [...result.matched.flatMap((m) => m.transactionsA), ...result.unmatchedA];
  const allB = [...result.matched.flatMap((m) => m.transactionsB), ...result.unmatchedB];
  check(allA, 'sourceA');
  check(allB, 'sourceB');
  return anomalies;
}

/** 7. Stale Unmatched: unmatched > 30 days older than newest transaction. */
function detectStaleUnmatched(result: ReconciliationResult): Anomaly[] {
  const all = allTransactions(result);
  if (all.length === 0) return [];
  const dates = all.map((t) => toDate(t.date).getTime());
  const newest = Math.max(...dates);
  const cutoff = newest - 30 * 24 * 60 * 60 * 1000;
  const stale = [...result.unmatchedA, ...result.unmatchedB].filter(
    (t) => toDate(t.date).getTime() < cutoff
  );
  if (stale.length === 0) return [];
  return [
    {
      id: genId('stale_unmatched', 0),
      type: 'stale_unmatched',
      severity: 'medium',
      title: 'Stale unmatched transactions',
      description: `${stale.length} unmatched transactions are more than 30 days older than the newest transaction.`,
      affectedTransactions: stale.map(toAffected),
      riskScore: 45,
      recommendedAction: 'Review and clean up old unmatched entries.',
    },
  ];
}

/** 8. Amount Mismatch Pattern: matched pairs with confidence < 85% and systematic amount discrepancy. */
function detectAmountMismatchPattern(result: ReconciliationResult): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const lowConf = result.matched.filter((m) => m.confidence < 0.85);
  if (lowConf.length < 2) return [];
  const diffs: number[] = [];
  for (const m of lowConf) {
    const sumA = m.transactionsA.reduce((s, t) => s + t.amount, 0);
    const sumB = m.transactionsB.reduce((s, t) => s + t.amount, 0);
    diffs.push(sumB - sumA);
  }
  const meanDiff = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const variance = diffs.reduce((s, d) => s + (d - meanDiff) ** 2, 0) / diffs.length;
  const stdDiff = Math.sqrt(variance) || 0.0001;
  const similar = diffs.filter((d) => Math.abs(d - meanDiff) < 1.5 * stdDiff);
  if (similar.length >= 2 && Math.abs(meanDiff) > 0.01) {
    const worst = lowConf.reduce((best, _m, i) =>
      Math.abs(diffs[i]! - meanDiff) < Math.abs((diffs[best] ?? 0) - meanDiff) ? i : best
    , 0);
    const match = lowConf[worst]!;
    const affected = [...match.transactionsA, ...match.transactionsB].map(toAffected);
    anomalies.push({
      id: genId('amount_mismatch_pattern', 0),
      type: 'amount_mismatch_pattern',
      severity: 'high',
      title: 'Systematic amount mismatch',
      description: `Multiple low-confidence matches show a consistent amount difference (~$${meanDiff.toFixed(2)}). May indicate fee or tax inconsistency.`,
      affectedTransactions: affected,
      riskScore: 65,
      recommendedAction: 'Investigate systematic discrepancy. Check for fees, taxes, or rounding applied inconsistently.',
    });
  }
  return anomalies;
}

export function detectAnomalies(result: ReconciliationResult): AnomalyReport {
  const anomalies: Anomaly[] = [
    ...detectDuplicatePayments(result),
    ...detectRoundAmounts(result),
    ...detectThresholdSplitting(result),
    ...detectUnusualAmounts(result),
    ...detectWeekendTransactions(result),
    ...detectDuplicateReferences(result),
    ...detectStaleUnmatched(result),
    ...detectAmountMismatchPattern(result),
  ];

  anomalies.sort((a, b) => b.riskScore - a.riskScore);

  const summary = {
    critical: anomalies.filter((a) => a.severity === 'critical').length,
    high: anomalies.filter((a) => a.severity === 'high').length,
    medium: anomalies.filter((a) => a.severity === 'medium').length,
    low: anomalies.filter((a) => a.severity === 'low').length,
    totalRiskScore: Math.min(
      100,
      anomalies.reduce((s, a) => s + a.riskScore, 0) / Math.max(anomalies.length, 1)
    ),
  };

  return {
    anomalies,
    summary,
    scannedAt: new Date(),
  };
}
