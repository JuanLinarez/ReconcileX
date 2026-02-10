/**
 * Smart column suggestions: analyze column names and data types from both sources
 * and suggest matching rule pairs with sensible defaults.
 */

import type { MatchingRule, RawCsvRow } from '@/features/reconciliation/types';
import type { ParsedCsv } from '@/features/reconciliation/types';
import { nextRuleId } from './defaultRules';

/** Semantic type for rule suggestion. Name-based keywords take priority over data. */
export type ColumnSemanticType = 'date' | 'numeric' | 'exact' | 'text';

/** Keyword groups in priority order: first match wins. */
const NAME_KEYWORDS: Array<{ type: ColumnSemanticType; keywords: string[] }> = [
  { type: 'date', keywords: ['date', 'fecha', 'time', 'period'] },
  { type: 'numeric', keywords: ['amount', 'total', 'price', 'cost', 'paid', 'balance', 'sum', 'value'] },
  { type: 'exact', keywords: ['code', 'id', 'number', 'num', 'ref'] },
  { type: 'text', keywords: ['name', 'description', 'desc', 'memo', 'note'] },
];

/** 1. Name-based type: if column name contains any keyword in a group, return that type. Priority order above. */
function typeFromColumnName(colName: string): ColumnSemanticType | null {
  const lower = colName.toLowerCase();
  for (const { type, keywords } of NAME_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return type;
  }
  return null;
}

/** 2. Only when name doesn't match: infer type from sample data. */
function inferColumnTypeFromData(rows: RawCsvRow[], column: string): ColumnSemanticType {
  const sample = rows.slice(0, 20);
  let numericCount = 0;
  let dateCount = 0;
  for (const row of sample) {
    const v = (row[column] ?? '').trim();
    if (!v) continue;
    const n = parseFloat(v.replace(/[$,]/g, ''));
    if (Number.isFinite(n)) {
      numericCount += 1;
      continue;
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime()) && v.length >= 6) {
      dateCount += 1;
    }
  }
  const total = numericCount + dateCount;
  if (sample.filter((r) => (r[column] ?? '').trim()).length === 0) return 'text';
  if (numericCount >= total * 0.8) return 'numeric';
  if (dateCount >= total * 0.6) return 'date';
  return 'text';
}

/** Effective type: name first, then data. */
function getColumnSemanticType(
  colName: string,
  rows: RawCsvRow[],
  column: string
): ColumnSemanticType {
  return typeFromColumnName(colName) ?? inferColumnTypeFromData(rows, column);
}

/** Keywords used for pair confidence (any overlap helps). */
const KEYWORDS_FOR_PAIR = [
  'amount', 'date', 'reference', 'invoice', 'payment', 'vendor', 'name', 'code', 'id', 'number',
];

type ColumnType = ColumnSemanticType;

function normalizeForSimilarity(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, ' ');
}

/** Score 0–1: how much the column name matches the keyword. */
function keywordScore(colName: string, keyword: string): number {
  const lower = colName.toLowerCase();
  const k = keyword.toLowerCase();
  if (lower === k) return 1;
  if (lower.includes(k)) return 0.8;
  const words = lower.split(/[\s_-]+/);
  if (words.some((w) => w.includes(k) || k.includes(w))) return 0.6;
  return 0;
}

/** Best keyword match for pair confidence (returns keyword or null). */
function bestKeywordForPair(colName: string): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const k of KEYWORDS_FOR_PAIR) {
    const s = keywordScore(colName, k);
    if (s > bestScore) {
      bestScore = s;
      best = k;
    }
  }
  return bestScore > 0 ? best : null;
}

/** Name similarity: shared words or substring overlap. */
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

export interface SuggestedPair {
  columnA: string;
  columnB: string;
  confidence: number;
  typeA: ColumnType;
  typeB: ColumnType;
}

/**
 * Analyze both sources and return suggested (columnA, columnB) pairs with confidence.
 * Column types use name-based keywords first, then data analysis. Ordered by confidence descending.
 */
export function analyzeColumnPairs(sourceA: ParsedCsv, sourceB: ParsedCsv): SuggestedPair[] {
  const headersA = sourceA.headers;
  const headersB = sourceB.headers;
  const rowsA = sourceA.rows;
  const rowsB = sourceB.rows;
  const typesA = new Map<string, ColumnType>();
  const typesB = new Map<string, ColumnType>();
  for (const h of headersA) typesA.set(h, getColumnSemanticType(h, rowsA, h));
  for (const h of headersB) typesB.set(h, getColumnSemanticType(h, rowsB, h));

  const pairs: SuggestedPair[] = [];
  for (const colA of headersA) {
    for (const colB of headersB) {
      const typeA = typesA.get(colA) ?? 'text';
      const typeB = typesB.get(colB) ?? 'text';
      const keywordA = bestKeywordForPair(colA);
      const keywordB = bestKeywordForPair(colB);
      const sameKeyword = keywordA != null && keywordA === keywordB;
      const nameSim = nameSimilarity(colA, colB);
      let confidence = 0;
      if (sameKeyword) confidence += 0.5;
      if (nameSim > 0) confidence += nameSim * 0.3;
      if (typeA === typeB) confidence += 0.2;
      if (confidence < 0.2) continue;
      pairs.push({
        columnA: colA,
        columnB: colB,
        confidence: Math.min(1, confidence),
        typeA,
        typeB,
      });
    }
  }
  pairs.sort((a, b) => b.confidence - a.confidence);
  return pairs;
}

/**
 * Build matching rules with sensible defaults from suggested pairs.
 * Deduplicates by (columnA, columnB) keeping highest confidence.
 */
export function buildSuggestedRules(
  sourceA: ParsedCsv,
  sourceB: ParsedCsv
): MatchingRule[] {
  const pairs = analyzeColumnPairs(sourceA, sourceB);
  const seen = new Set<string>();
  const rules: MatchingRule[] = [];
  for (const p of pairs) {
    const key = `${p.columnA}\t${p.columnB}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (p.confidence < 0.25) continue;

    const typeA = p.typeA;
    const typeB = p.typeB;
    let matchType: MatchingRule['matchType'] = 'exact';
    let toleranceValue: number | undefined;
    let toleranceNumericMode: MatchingRule['toleranceNumericMode'] = 'percentage';
    let similarityThreshold: number | undefined;

    if (typeA === 'date' && typeB === 'date') {
      matchType = 'tolerance_date';
      toleranceValue = 3;
    } else if (typeA === 'numeric' && typeB === 'numeric') {
      matchType = 'tolerance_numeric';
      toleranceValue = 0.005;
      toleranceNumericMode = 'percentage';
    } else if (typeA === 'exact' || typeB === 'exact') {
      matchType = 'exact';
    } else {
      matchType = 'similar_text';
      similarityThreshold = 0.7;
    }

    rules.push({
      id: nextRuleId(),
      columnA: p.columnA,
      columnB: p.columnB,
      matchType,
      toleranceValue,
      toleranceNumericMode,
      similarityThreshold,
      weight: 1,
      suggested: true,
    });
  }

  const n = rules.length;
  if (n > 0) {
    const equalWeight = 1 / n;
    for (const r of rules) r.weight = equalWeight;
  }
  return rules;
}
