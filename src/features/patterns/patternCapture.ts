/**
 * Pattern capture for learning from user decisions.
 * Fire-and-forget: call without awaiting. All calls use .catch(console.error).
 */

import { recordPattern } from '@/lib/database';
import type { Transaction } from '@/features/reconciliation/types';
import type { MatchingRule } from '@/features/reconciliation/types';

/** Get a stable identifier for an accept/reject pair (reference + amount). */
function txIdentifier(t: Transaction): string {
  const ref = String(t.raw?.reference ?? t.reference ?? '').trim();
  const amt = typeof t.amount === 'number' ? t.amount.toFixed(2) : '';
  return `${ref}|${amt}`;
}

/** Extract vendor/payee name from raw if available. */
function getVendorName(t: Transaction): string | null {
  const raw = t.raw ?? {};
  const candidates = [
    raw['VendorName'],
    raw['PayeeName'],
    raw['Payee'],
    raw['Vendor'],
    raw['Customer'],
    raw['Company'],
    raw['Name'],
  ];
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * When user accepts an AI-suggested match:
 * - Record match_acceptance with identifiers
 * - If vendor names differ, record vendor_mapping
 * - Record column_pair_preference for each rule
 */
export function captureMatchAcceptance(
  orgId: string,
  transactionA: Transaction,
  transactionB: Transaction,
  rules: MatchingRule[]
): void {
  if (!orgId) return;

  const idA = txIdentifier(transactionA);
  const idB = txIdentifier(transactionB);

  recordPattern(orgId, {
    pattern_type: 'match_acceptance',
    source_value: idA,
    target_value: idB,
  }).catch(console.error);

  const vendorA = getVendorName(transactionA);
  const vendorB = getVendorName(transactionB);
  if (vendorA && vendorB && vendorA !== vendorB) {
    recordPattern(orgId, {
      pattern_type: 'vendor_mapping',
      source_value: vendorA,
      target_value: vendorB,
    }).catch(console.error);
  }

  for (const rule of rules) {
    if (rule.columnA && rule.columnB) {
      recordPattern(orgId, {
        pattern_type: 'column_pair_preference',
        column_a: rule.columnA,
        column_b: rule.columnB,
        context: {
          matchType: rule.matchType,
          weight: rule.weight,
        },
      }).catch(console.error);
    }
  }
}

/**
 * When user dismisses an AI-suggested match:
 * - Record match_rejection with the pair identifiers
 */
export function captureMatchRejection(
  orgId: string,
  transactionA: Transaction,
  transactionB: Transaction
): void {
  if (!orgId) return;

  const idA = txIdentifier(transactionA);
  const idB = txIdentifier(transactionB);

  recordPattern(orgId, {
    pattern_type: 'match_rejection',
    source_value: idA,
    target_value: idB,
  }).catch(console.error);
}

export interface NormalizationDecision {
  original: string;
  normalized: string;
  column: string;
  accepted: boolean;
}

/**
 * When user accepts/rejects normalization fixes:
 * - For each accepted fix: record normalization_rule
 */
export function captureNormalizationDecision(
  orgId: string,
  decisions: NormalizationDecision[]
): void {
  if (!orgId) return;

  for (const d of decisions) {
    if (!d.accepted) continue;
    recordPattern(orgId, {
      pattern_type: 'normalization_rule',
      source_value: d.original,
      target_value: d.normalized,
      column_a: d.column,
    }).catch(console.error);
  }
}

/**
 * When user runs matching:
 * - For each rule: record column_pair_preference
 */
export function captureRuleConfiguration(
  orgId: string,
  rules: MatchingRule[]
): void {
  if (!orgId) return;

  for (const rule of rules) {
    if (rule.columnA && rule.columnB) {
      recordPattern(orgId, {
        pattern_type: 'column_pair_preference',
        column_a: rule.columnA,
        column_b: rule.columnB,
        context: {
          matchType: rule.matchType,
          weight: rule.weight,
        },
      }).catch(console.error);
    }
  }
}
