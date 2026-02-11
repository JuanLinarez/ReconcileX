/**
 * Smart column suggestions: analyze column names and data types from both sources
 * and suggest matching rule pairs with sensible defaults.
 *
 * Rules are non-redundant: each column appears in at most one rule.
 * Maximum 3-4 rules. Prioritized: amount > date > reference > name > description.
 */

import type { MatchingRule, RawCsvRow } from '@/features/reconciliation/types';
import type { ParsedCsv } from '@/features/reconciliation/types';
import { nextRuleId } from './defaultRules';

/** Semantic type for rule suggestion. Name-based keywords take priority over data. */
export type ColumnSemanticType = 'date' | 'numeric' | 'exact' | 'text';

/** Semantic role for column matching. Each column gets exactly one role. */
type ColumnRole =
  | 'amount'
  | 'transaction_date'
  | 'reference_id'
  | 'entity_name'
  | 'description'
  | 'skip';

/** Role definitions in priority order. First match wins. */
const ROLE_PATTERNS: Array<{ role: ColumnRole; includes: RegExp[]; excludes?: RegExp[] }> = [
  {
    role: 'amount',
    includes: [
      /amount|total|sum|value|price|cost|paid|balance/i,
    ],
    excludes: [/date/i],
  },
  {
    role: 'transaction_date',
    includes: [
      /transdate|trans_date|transaction\s*date|invoicedate|invoice_date/i,
      /posting\s*date|postdate|post_date|effective\s*date|payment\s*date/i,
    ],
    excludes: [/duedate|due_date|due\s*date|maturity|expiry/i],
  },
  {
    role: 'reference_id',
    includes: [/code|ref|id|number|num|invoice/i],
    excludes: [/name|description/i],
  },
  {
    role: 'entity_name',
    includes: [
      /vendor|payee|customer|company|supplier|client|name/i,
    ],
    excludes: [/description/i],
  },
  {
    role: 'description',
    includes: [/description|desc|memo|note|narrative|details/i],
  },
];

function assignColumnRole(colName: string): ColumnRole {
  const lower = colName.toLowerCase();
  for (const { role, includes, excludes } of ROLE_PATTERNS) {
    const matchesInclude = includes.some((re) => re.test(lower));
    const matchesExclude = excludes?.some((re) => re.test(lower));
    if (matchesInclude && !matchesExclude) return role;
  }
  return 'skip';
}

function normalizeForSimilarity(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, ' ');
}

/** Name similarity 0–1. */
function nameSimilarity(a: string, b: string): number {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (na === nb) return 1;
  const wordsA = new Set(na.split(' ').filter(Boolean));
  const wordsB = new Set(nb.split(' ').filter(Boolean));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection += 1;
    else if ([...wordsB].some((bw) => bw.includes(w) || w.includes(bw))) intersection += 0.5;
  }
  const union = wordsA.size + wordsB.size - intersection;
  if (union <= 0) return 0;
  return Math.min(1, (intersection / union) * 1.2);
}

/** Legacy type for backward compatibility. */
function roleToSemanticType(role: ColumnRole): ColumnSemanticType {
  switch (role) {
    case 'amount':
      return 'numeric';
    case 'transaction_date':
      return 'date';
    case 'reference_id':
      return 'exact';
    case 'entity_name':
    case 'description':
      return 'text';
    default:
      return 'text';
  }
}

function detectReferenceMatchType(
  rowsA: RawCsvRow[],
  columnA: string,
  rowsB: RawCsvRow[],
  columnB: string
): { matchType: 'exact' | 'similar_text'; threshold?: number } {
  const samplesA = rowsA
    .slice(0, 10)
    .map((r) => (r[columnA] ?? '').trim())
    .filter(Boolean);
  const samplesB = rowsB
    .slice(0, 10)
    .map((r) => (r[columnB] ?? '').trim())
    .filter(Boolean);

  if (samplesA.length === 0) return { matchType: 'exact' };

  const normalizeRef = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  let fuzzyMatches = 0;
  for (const a of samplesA) {
    const normA = normalizeRef(a);
    if (samplesB.some((b) => normalizeRef(b) === normA)) fuzzyMatches += 1;
  }

  if (fuzzyMatches / samplesA.length > 0.3) {
    return { matchType: 'similar_text', threshold: 0.8 };
  }
  return { matchType: 'exact' };
}

/** Find best (columnA, columnB) pair for a role. Excludes already-used columns. */
function findBestPairForRole(
  role: ColumnRole,
  colsA: string[],
  colsB: string[],
  roleA: Map<string, ColumnRole>,
  roleB: Map<string, ColumnRole>,
  usedA: Set<string>,
  usedB: Set<string>
): { columnA: string; columnB: string; similarity: number } | null {
  const candidatesA = colsA.filter((c) => roleA.get(c) === role && !usedA.has(c));
  const candidatesB = colsB.filter((c) => roleB.get(c) === role && !usedB.has(c));
  if (candidatesA.length === 0 || candidatesB.length === 0) return null;

  let best: { columnA: string; columnB: string; similarity: number } | null = null;
  for (const cA of candidatesA) {
    for (const cB of candidatesB) {
      const sim = nameSimilarity(cA, cB);
      if (!best || sim > best.similarity) {
        best = { columnA: cA, columnB: cB, similarity: sim };
      }
    }
  }
  return best;
}

export interface SuggestedPair {
  columnA: string;
  columnB: string;
  confidence: number;
  typeA: ColumnSemanticType;
  typeB: ColumnSemanticType;
}

/** Role priority for rule inclusion. */
const ROLE_PRIORITY: ColumnRole[] = [
  'amount',
  'transaction_date',
  'reference_id',
  'entity_name',
  'description',
];

/**
 * Analyze both sources and return suggested (columnA, columnB) pairs with confidence.
 * Each column appears in at most one pair. Up to 4 pairs.
 */
export function analyzeColumnPairs(sourceA: ParsedCsv, sourceB: ParsedCsv): SuggestedPair[] {
  const headersA = sourceA.headers;
  const headersB = sourceB.headers;
  const roleA = new Map<string, ColumnRole>();
  const roleB = new Map<string, ColumnRole>();
  for (const h of headersA) roleA.set(h, assignColumnRole(h));
  for (const h of headersB) roleB.set(h, assignColumnRole(h));

  const usedA = new Set<string>();
  const usedB = new Set<string>();
  const pairs: SuggestedPair[] = [];

  for (const role of ROLE_PRIORITY) {
    if (pairs.length >= 4) break;

    const best = findBestPairForRole(
      role,
      headersA,
      headersB,
      roleA,
      roleB,
      usedA,
      usedB
    );
    if (!best) continue;

    usedA.add(best.columnA);
    usedB.add(best.columnB);
    pairs.push({
      columnA: best.columnA,
      columnB: best.columnB,
      confidence: 0.5 + best.similarity * 0.5,
      typeA: roleToSemanticType(role),
      typeB: roleToSemanticType(role),
    });
  }

  return pairs;
}

/**
 * Build matching rules with sensible defaults from suggested pairs.
 * Maximum 4 rules. Weights normalized to sum to 1.0.
 */
export function buildSuggestedRules(
  sourceA: ParsedCsv,
  sourceB: ParsedCsv
): MatchingRule[] {
  const pairs = analyzeColumnPairs(sourceA, sourceB);
  const rules: MatchingRule[] = [];

  const weightByRole: Record<ColumnRole, number> = {
    amount: 0.4,
    transaction_date: 0.25,
    reference_id: 0.2,
    entity_name: 0.15,
    description: 0.1,
    skip: 0,
  };

  for (const p of pairs) {
    const roleA = assignColumnRole(p.columnA);
    const roleB = assignColumnRole(p.columnB);
    const role = roleA === roleB ? roleA : 'skip';
    if (role === 'skip') continue;

    let matchType: MatchingRule['matchType'] = 'exact';
    let toleranceValue: number | undefined;
    let toleranceNumericMode: MatchingRule['toleranceNumericMode'] = 'percentage';
    let similarityThreshold: number | undefined;
    let weight = weightByRole[role];

    if (role === 'amount') {
      matchType = 'tolerance_numeric';
      toleranceValue = 0.005;
      toleranceNumericMode = 'percentage';
    } else if (role === 'transaction_date') {
      matchType = 'tolerance_date';
      toleranceValue = 3;
    } else if (role === 'reference_id') {
      const ref = detectReferenceMatchType(
        sourceA.rows,
        p.columnA,
        sourceB.rows,
        p.columnB
      );
      matchType = ref.matchType;
      similarityThreshold = ref.threshold;
    } else if (role === 'entity_name') {
      matchType = 'similar_text';
      similarityThreshold = 0.7;
    } else if (role === 'description') {
      matchType = 'similar_text';
      similarityThreshold = 0.6;
    }

    rules.push({
      id: nextRuleId(),
      columnA: p.columnA,
      columnB: p.columnB,
      matchType,
      toleranceValue,
      toleranceNumericMode,
      similarityThreshold,
      weight,
      suggested: true,
    });
  }

  const totalWeight = rules.reduce((s, r) => s + r.weight, 0);
  if (totalWeight > 0) {
    const factor = 1 / totalWeight;
    for (const r of rules) r.weight *= factor;
  }

  return rules;
}
