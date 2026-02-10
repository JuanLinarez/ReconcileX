/**
 * Client-side status and manual match state for Results page.
 * Not persisted to backend yet.
 */

import type { MatchResult, Transaction } from '@/features/reconciliation/types';

export type UnmatchedStatus = 'reviewed' | 'ignored' | null;

/** Status applied to an unmatched transaction row. */
export interface UnmatchedRowStatus {
  status: UnmatchedStatus;
}

/** A manual match created by the user, with optional note. */
export interface ManualMatchEntry {
  match: MatchResult;
  note?: string;
}

/** Full augmentation state for the Results page. */
export interface ResultsAugmentation {
  reviewedIds: Set<string>;
  ignoredIds: Set<string>;
  manualMatches: ManualMatchEntry[];
  showIgnored: boolean;
}

export function createInitialAugmentation(): ResultsAugmentation {
  return {
    reviewedIds: new Set(),
    ignoredIds: new Set(),
    manualMatches: [],
    showIgnored: true,
  };
}

/** IDs of transactions that are part of a manual match (no longer in unmatched lists). */
export function getIdsInManualMatches(manualMatches: ManualMatchEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const { match } of manualMatches) {
    for (const t of match.transactionsA) ids.add(t.id);
    for (const t of match.transactionsB) ids.add(t.id);
  }
  return ids;
}

/** Filter and sort unmatched list: exclude manual-matched, put ignored at bottom. */
export function getDisplayedUnmatched<T extends Transaction>(
  list: T[],
  manualMatchIds: Set<string>,
  ignoredIds: Set<string>,
  showIgnored: boolean
): T[] {
  const filtered = list.filter((t) => !manualMatchIds.has(t.id));
  if (!showIgnored) return filtered.filter((t) => !ignoredIds.has(t.id));
  return [...filtered].sort((a, b) => {
    const aIgnored = ignoredIds.has(a.id) ? 1 : 0;
    const bIgnored = ignoredIds.has(b.id) ? 1 : 0;
    return aIgnored - bIgnored;
  });
}

/** Match result with optional manual flag for display. */
export interface MatchResultView extends MatchResult {
  isManual?: boolean;
  note?: string;
}
