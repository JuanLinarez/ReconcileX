/**
 * Vercel serverless API route: Server-side matching for large datasets.
 * Runs the same matching logic as useMatching.ts to avoid browser freeze.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 55 };

const MAX_TOTAL_ROWS = 100_000;

// --- Inline types (no @/ or src/ imports) ---

type DataSource = 'sourceA' | 'sourceB';

interface ColumnMapping {
  amount: string;
  date: string;
  reference: string;
}

interface Transaction {
  id: string;
  source: DataSource;
  amount: number;
  date: Date;
  reference: string;
  rowIndex: number;
  raw: Record<string, string>;
}

type MatchingType = 'oneToOne' | 'group';

type MatchType =
  | 'exact'
  | 'tolerance_numeric'
  | 'tolerance_date'
  | 'similar_text'
  | 'contains';

interface MatchingRule {
  id: string;
  columnA: string;
  columnB: string;
  matchType: MatchType;
  toleranceValue?: number;
  toleranceNumericMode?: 'fixed' | 'percentage';
  similarityThreshold?: number;
  weight: number;
}

interface MatchingConfig {
  rules: MatchingRule[];
  minConfidenceThreshold: number;
  matchingType: MatchingType;
}

interface MatchResult {
  transactionsA: Transaction[];
  transactionsB: Transaction[];
  confidence: number;
}

// --- Utilities ---

function parseAmount(value: string): number {
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseDate(value: string): Date {
  const s = String(value ?? '').trim();
  if (!s) return new Date(NaN);
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  const [a, b, c] = s.split(/[/\-.\s]/).map((x) => parseInt(x, 10));
  if (a !== undefined && b !== undefined && c !== undefined) {
    const d = new Date(c, b - 1, a);
    if (!Number.isNaN(d.getTime())) return d;
    const d2 = new Date(a, b - 1, c);
    if (!Number.isNaN(d2.getTime())) return d2;
  }
  return new Date(NaN);
}

function levenshteinDistance(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;
  const matrix: number[][] = Array.from({ length: lenA + 1 }, () =>
    Array.from({ length: lenB + 1 }, () => 0)
  );
  for (let i = 0; i <= lenA; i++) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j;
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[lenA][lenB];
}

function normalizedSimilarity(a: string, b: string): number {
  const trimmedA = a.trim();
  const trimmedB = b.trim();
  if (trimmedA === trimmedB) return 1;
  if (trimmedA.length === 0 || trimmedB.length === 0) return 0;
  const distance = levenshteinDistance(trimmedA, trimmedB);
  const maxLen = Math.max(trimmedA.length, trimmedB.length);
  return 1 - distance / maxLen;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now()}`;
}

function deriveColumnMappingFromRules(
  rules: MatchingRule[],
  headersA: string[],
  headersB: string[]
): { mappingA: ColumnMapping; mappingB: ColumnMapping } {
  const [first = '', second = '', third = ''] = headersA;
  const [firstB = '', secondB = '', thirdB = ''] = headersB;
  let amountA = first;
  let dateA = second;
  let refA = third;
  let amountB = firstB;
  let dateB = secondB;
  let refB = thirdB;
  for (const r of rules) {
    if (r.matchType === 'tolerance_numeric' && r.columnA && r.columnB) {
      amountA = r.columnA;
      amountB = r.columnB;
      break;
    }
  }
  for (const r of rules) {
    if (r.matchType === 'tolerance_date' && r.columnA && r.columnB) {
      dateA = r.columnA;
      dateB = r.columnB;
      break;
    }
  }
  for (const r of rules) {
    if (r.matchType === 'exact' && r.columnA && r.columnB) {
      refA = r.columnA;
      refB = r.columnB;
      break;
    }
  }
  return {
    mappingA: { amount: amountA, date: dateA, reference: refA },
    mappingB: { amount: amountB, date: dateB, reference: refB },
  };
}

function normalizeToTransactions(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  source: DataSource
): Transaction[] {
  return rows.map((raw, rowIndex) => {
    const amount = parseAmount(raw[mapping.amount] ?? '');
    const date = parseDate(raw[mapping.date] ?? '');
    const reference = String(raw[mapping.reference] ?? '').trim() || `Row ${rowIndex + 1}`;
    return {
      id: nextId(source),
      source,
      amount,
      date,
      reference,
      rowIndex: rowIndex + 1,
      raw,
    };
  });
}

// --- Matching logic ---

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
      const tol = mode === 'fixed' ? rawVal : Math.max(numA, numB, 0) * rawVal;
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

function pairScore(ta: Transaction, tb: Transaction, rules: MatchingRule[]): number {
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

function getGroupAmountTolerance(rules: MatchingRule[]): (targetAmount: number) => number {
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

function runMatching(
  transactionsA: Transaction[],
  transactionsB: Transaction[],
  config: MatchingConfig
): { matched: MatchResult[]; unmatchedA: Transaction[]; unmatchedB: Transaction[] } {
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
    };
  }

  return { matched, unmatchedA, unmatchedB };
}

// --- Serialization: Transaction with Date -> ISO string ---

interface TransactionPayload {
  id: string;
  source: DataSource;
  amount: number;
  date: string;
  reference: string;
  rowIndex: number;
  raw: Record<string, string>;
}

interface MatchResultPayload {
  transactionsA: TransactionPayload[];
  transactionsB: TransactionPayload[];
  confidence: number;
}

function toPayload(t: Transaction): TransactionPayload {
  return {
    id: t.id,
    source: t.source,
    amount: t.amount,
    date: t.date instanceof Date ? t.date.toISOString() : String(t.date),
    reference: t.reference,
    rowIndex: t.rowIndex,
    raw: t.raw,
  };
}

function toPayloadMatch(m: MatchResult): MatchResultPayload {
  return {
    transactionsA: m.transactionsA.map(toPayload),
    transactionsB: m.transactionsB.map(toPayload),
    confidence: m.confidence,
  };
}

// --- Request/Response types ---

interface MatchRequestBody {
  sourceA: { headers: string[]; rows: Record<string, string>[]; filename?: string };
  sourceB: { headers: string[]; rows: Record<string, string>[]; filename?: string };
  config: {
    rules: MatchingRule[];
    minConfidenceThreshold: number;
    matchingType: 'oneToOne' | 'group';
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body: MatchRequestBody;
  try {
    body = req.body as MatchRequestBody;
    if (
      !body ||
      !body.sourceA ||
      !body.sourceB ||
      !body.config ||
      !Array.isArray(body.sourceA.rows) ||
      !Array.isArray(body.sourceB.rows) ||
      !Array.isArray(body.config.rules) ||
      body.config.rules.length === 0
    ) {
      res.status(400).json({
        error: 'Bad request',
        message: 'Request body must include sourceA, sourceB, config with rules',
      });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Bad request', message: 'Invalid JSON body' });
    return;
  }

  const totalRows = body.sourceA.rows.length + body.sourceB.rows.length;
  if (totalRows > MAX_TOTAL_ROWS) {
    res.status(413).json({
      error: 'Payload too large',
      message: `Total rows (${totalRows}) exceeds limit of ${MAX_TOTAL_ROWS}`,
    });
    return;
  }

  const startTime = Date.now();
  console.log(
    `Processing ${body.sourceA.rows.length} source A rows × ${body.sourceB.rows.length} source B rows`
  );

  try {
    const { mappingA, mappingB } = deriveColumnMappingFromRules(
      body.config.rules,
      body.sourceA.headers,
      body.sourceB.headers
    );

    const transactionsA = normalizeToTransactions(
      body.sourceA.rows,
      mappingA,
      'sourceA'
    );
    const transactionsB = normalizeToTransactions(
      body.sourceB.rows,
      mappingB,
      'sourceB'
    );

    const { matched, unmatchedA, unmatchedB } = runMatching(
      transactionsA,
      transactionsB,
      body.config
    );

    const processingTimeMs = Date.now() - startTime;
    const total = transactionsA.length + transactionsB.length;
    const matchRate = total > 0 ? matched.length * 2 / total : 0;

    res.status(200).json({
      matched: matched.map(toPayloadMatch),
      unmatchedA: unmatchedA.map(toPayload),
      unmatchedB: unmatchedB.map(toPayload),
      config: body.config,
      stats: {
        matchedCount: matched.length,
        unmatchedACount: unmatchedA.length,
        unmatchedBCount: unmatchedB.length,
        matchRate,
        processingTimeMs,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[match] Error:', message);
    res.status(500).json({
      error: 'Matching failed',
      message: process.env.NODE_ENV === 'development' ? message : 'An error occurred during matching.',
    });
  }
}
