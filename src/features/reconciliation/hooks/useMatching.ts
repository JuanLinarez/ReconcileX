import { useCallback } from 'react';
import type {
  MatchingConfig,
  MatchingRule,
  MatchResult,
  ReconciliationResult,
  Transaction,
} from '../types';
import {
  deriveColumnMappingFromRules,
  normalizeToTransactions,
  parseAmount,
  parseDate,
} from '../utils/normalize';
import { normalizedSimilarity } from '../utils/levenshtein';
import type { ParsedCsv } from '../types';

const MAX_GROUP_SUBSET_SIZE = 12;

function ruleScore(
  rawA: Record<string, string>,
  rawB: Record<string, string>,
  rule: MatchingRule
): number {
  const valA = String(rawA[rule.columnA] ?? '').trim();
  const valB = String(rawB[rule.columnB] ?? '').trim();

  switch (rule.matchType) {
    case 'exact': {
      const a = valA.toLowerCase();
      const b = valB.toLowerCase();
      if (!a || !b) return 0;
      if (a === b) return 1;
      if (a.includes(b) || b.includes(a)) return 0.8;
      const minLen = Math.min(a.length, b.length);
      let matches = 0;
      for (let i = 0; i < minLen; i++) if (a[i] === b[i]) matches += 1;
      return minLen ? matches / Math.max(a.length, b.length) : 0;
    }
    case 'tolerance_numeric': {
      const numA = parseAmount(valA);
      const numB = parseAmount(valB);
      const mode = rule.toleranceNumericMode ?? 'percentage';
      const rawVal = rule.toleranceValue ?? 0.005;
      const tol =
        mode === 'fixed'
          ? rawVal
          : Math.max(numA, numB, 0) * rawVal;
      const diff = Math.abs(numA - numB);
      if (diff <= tol) return 1;
      return Math.max(0, 1 - diff / (tol * 10));
    }
    case 'tolerance_date': {
      const dateA = parseDate(valA);
      const dateB = parseDate(valB);
      const tolDays = rule.toleranceValue ?? 3;
      const a = dateA.getTime();
      const b = dateB.getTime();
      if (Number.isNaN(a) || Number.isNaN(b)) return 0;
      const diffDays = Math.abs(a - b) / (24 * 60 * 60 * 1000);
      if (diffDays <= tolDays) return 1;
      return Math.max(0, 1 - diffDays / (tolDays * 5));
    }
    case 'similar_text': {
      const a = valA.toLowerCase();
      const b = valB.toLowerCase();
      if (!a || !b) return 0;
      const similarity = normalizedSimilarity(a, b);
      const threshold = rule.similarityThreshold ?? 0.8;
      return similarity >= threshold ? similarity : 0;
    }
    case 'contains': {
      const a = valA.toLowerCase();
      const b = valB.toLowerCase();
      if (!a || !b) return 0;
      if (a.includes(b) || b.includes(a)) return 1;
      return 0;
    }
    default:
      return 0;
  }
}

function pairScore(
  ta: Transaction,
  tb: Transaction,
  rules: MatchingRule[]
): number {
  if (rules.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const rule of rules) {
    const w = rule.weight > 0 ? rule.weight : 1;
    weightedSum += ruleScore(ta.raw, tb.raw, rule) * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Find one subset of transactions whose amounts sum to target ± tolerance.
 */
function findSubsetWithSum(
  transactions: Transaction[],
  targetAmount: number,
  tolerance: number,
  maxSize: number
): Transaction[] | null {
  const sorted = [...transactions].sort((a, b) => a.amount - b.amount);
  let best: Transaction[] | null = null;

  function search(start: number, sum: number, chosen: Transaction[]): boolean {
    if (Math.abs(sum - targetAmount) <= tolerance) {
      best = [...chosen];
      return true;
    }
    if (chosen.length >= maxSize || start >= sorted.length) return false;
    if (sum > targetAmount + tolerance) return false;

    for (let i = start; i < sorted.length; i++) {
      const t = sorted[i];
      if (search(i + 1, sum + t.amount, [...chosen, t])) return true;
    }
    return false;
  }

  search(0, 0, []);
  return best;
}

/** Effective tolerance for group pass: returns tolerance for a given target amount. */
function getGroupAmountTolerance(
  rules: MatchingRule[]
): (targetAmount: number) => number {
  const r = rules.find((x) => x.matchType === 'tolerance_numeric');
  const mode = r?.toleranceNumericMode ?? 'percentage';
  const rawVal = r?.toleranceValue ?? 0.005;
  return (targetAmount: number) =>
    mode === 'fixed' ? rawVal : Math.max(targetAmount, 0) * rawVal;
}

function runOneToOnePass(
  transactionsA: Transaction[],
  transactionsB: Transaction[],
  config: MatchingConfig
): { matched: MatchResult[]; unmatchedA: Transaction[]; unmatchedB: Transaction[] } {
  const rules = config.rules;
  type Pair = { a: Transaction; b: Transaction; score: number };
  const pairs: Pair[] = [];
  for (const a of transactionsA) {
    for (const b of transactionsB) {
      const score = pairScore(a, b, rules);
      if (score >= config.minConfidenceThreshold) pairs.push({ a, b, score });
    }
  }
  pairs.sort((x, y) => y.score - x.score);

  const matchedAIds = new Set<string>();
  const matchedBIds = new Set<string>();
  const matched: MatchResult[] = [];

  for (const { a, b, score } of pairs) {
    if (matchedAIds.has(a.id) || matchedBIds.has(b.id)) continue;
    matchedAIds.add(a.id);
    matchedBIds.add(b.id);
    matched.push({
      transactionsA: [a],
      transactionsB: [b],
      confidence: score,
    });
  }

  const unmatchedA = transactionsA.filter((t) => !matchedAIds.has(t.id));
  const unmatchedB = transactionsB.filter((t) => !matchedBIds.has(t.id));
  return { matched, unmatchedA, unmatchedB };
}

function runGroupPass(
  unmatchedA: Transaction[],
  unmatchedB: Transaction[],
  rules: MatchingRule[]
): { groupMatched: MatchResult[]; remainingA: Transaction[]; remainingB: Transaction[] } {
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  const groupMatched: MatchResult[] = [];
  const getTol = getGroupAmountTolerance(rules);

  for (const a of unmatchedA) {
    if (usedA.has(a.id)) continue;
    const tol = getTol(a.amount);
    const availableB = unmatchedB.filter((t) => !usedB.has(t.id));
    const subsetB = findSubsetWithSum(availableB, a.amount, tol, MAX_GROUP_SUBSET_SIZE);
    if (subsetB && subsetB.length > 0) {
      usedA.add(a.id);
      subsetB.forEach((t) => usedB.add(t.id));
      const sumB = subsetB.reduce((s, t) => s + t.amount, 0);
      const confidence = Math.abs(sumB - a.amount) <= tol ? 1 : 0.9;
      groupMatched.push({
        transactionsA: [a],
        transactionsB: subsetB,
        confidence,
      });
    }
  }

  const remainingA = unmatchedA.filter((t) => !usedA.has(t.id));
  const remainingB = unmatchedB.filter((t) => !usedB.has(t.id));

  for (const b of remainingB) {
    if (usedB.has(b.id)) continue;
    const tol = getTol(b.amount);
    const availableA = remainingA.filter((t) => !usedA.has(t.id));
    const subsetA = findSubsetWithSum(availableA, b.amount, tol, MAX_GROUP_SUBSET_SIZE);
    if (subsetA && subsetA.length > 0) {
      usedB.add(b.id);
      subsetA.forEach((t) => usedA.add(t.id));
      const sumA = subsetA.reduce((s, t) => s + t.amount, 0);
      const confidence = Math.abs(sumA - b.amount) <= tol ? 1 : 0.9;
      groupMatched.push({
        transactionsA: subsetA,
        transactionsB: [b],
        confidence,
      });
    }
  }

  const finalA = remainingA.filter((t) => !usedA.has(t.id));
  const finalB = remainingB.filter((t) => !usedB.has(t.id));
  return { groupMatched, remainingA: finalA, remainingB: finalB };
}

export function runMatching(
  transactionsA: Transaction[],
  transactionsB: Transaction[],
  config: MatchingConfig
): ReconciliationResult {
  const { matched, unmatchedA, unmatchedB } = runOneToOnePass(
    transactionsA,
    transactionsB,
    config
  );

  if (
    config.matchingType === 'group' &&
    config.rules.length > 0 &&
    (unmatchedA.length > 0 || unmatchedB.length > 0)
  ) {
    const { groupMatched, remainingA, remainingB } = runGroupPass(
      unmatchedA,
      unmatchedB,
      config.rules
    );
    return {
      matched: [...matched, ...groupMatched],
      unmatchedA: remainingA,
      unmatchedB: remainingB,
      config,
    };
  }

  return {
    matched,
    unmatchedA,
    unmatchedB,
    config,
  };
}

export interface UseMatchingOptions {
  sourceA: ParsedCsv | null;
  sourceB: ParsedCsv | null;
  config: MatchingConfig;
}

export function useMatching(options: UseMatchingOptions) {
  const { sourceA, sourceB, config } = options;

  const run = useCallback((): ReconciliationResult | null => {
    if (!sourceA?.rows.length || !sourceB?.rows.length || config.rules.length === 0) return null;
    const headersA = sourceA.headers;
    const headersB = sourceB.headers;
    const { mappingA, mappingB } = deriveColumnMappingFromRules(
      config.rules,
      headersA,
      headersB
    );
    const transactionsA = normalizeToTransactions(sourceA.rows, mappingA, 'sourceA');
    const transactionsB = normalizeToTransactions(sourceB.rows, mappingB, 'sourceB');
    return runMatching(transactionsA, transactionsB, config);
  }, [sourceA, sourceB, config]);

  return { run };
}
