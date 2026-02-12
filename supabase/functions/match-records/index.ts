import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---------- CSV PARSER ----------

function parseCsvText(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (inQuotes && csv[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.length > 0) lines.push(current);
      current = '';
      if (ch === '\r' && csv[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current.length > 0) lines.push(current);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { field += '"'; i++; }
        else { inQ = !inQ; }
      } else if (c === ',' && !inQ) {
        fields.push(field); field = '';
      } else { field += c; }
    }
    fields.push(field);
    return fields;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = (values[i] ?? '').trim();
      if (v) row[h] = v;
    });
    return row;
  });
  return { headers, rows };
}

// ---------- MATCHING ENGINE (from api/match.ts) ----------

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

function levenshteinDistance(a: string, b: string, maxDistance?: number): number {
  if (a === b) return 0;
  let s1 = a, s2 = b;
  if (s1.length > s2.length) { const tmp = s1; s1 = s2; s2 = tmp; }
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  if (maxDistance !== undefined && (len2 - len1) > maxDistance) return len2 - len1;

  const row = new Array<number>(len1 + 1);
  for (let i = 0; i <= len1; i++) row[i] = i;

  for (let j = 1; j <= len2; j++) {
    let prev = row[0];
    row[0] = j;
    let rowMin = row[0];
    for (let i = 1; i <= len1; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      const val = Math.min(
        row[i] + 1,
        row[i - 1] + 1,
        prev + cost
      );
      prev = row[i];
      row[i] = val;
      if (val < rowMin) rowMin = val;
    }
    if (maxDistance !== undefined && rowMin > maxDistance) return rowMin;
  }
  return row[len1];
}

function normalizedSimilarity(a: string, b: string, threshold?: number): number {
  const ta = a.trim();
  const tb = b.trim();
  if (ta === tb) return 1;
  if (ta.length === 0 || tb.length === 0) return 0;

  const maxLen = Math.max(ta.length, tb.length);

  if (threshold !== undefined) {
    const lenDiff = Math.abs(ta.length - tb.length);
    const bestPossible = 1 - lenDiff / maxLen;
    if (bestPossible < threshold) return bestPossible;
  }

  const maxDist = threshold !== undefined ? Math.floor(maxLen * (1 - threshold)) : undefined;
  const distance = levenshteinDistance(ta, tb, maxDist);
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

type SimilarityCache = Map<string, Map<string, number>>;

function buildSimilarityCache(
  transactionsA: Transaction[],
  transactionsB: Transaction[],
  rules: MatchingRule[]
): SimilarityCache {
  const cache: SimilarityCache = new Map();

  for (const rule of rules) {
    if (rule.matchType !== 'similar_text') continue;
    const threshold = rule.similarityThreshold ?? 0.8;
    const cacheKey = `${rule.columnA}::${rule.columnB}`;
    const pairCache = new Map<string, number>();

    const uniqueA = new Set<string>();
    const uniqueB = new Set<string>();
    for (const t of transactionsA) {
      const v = String(t.raw[rule.columnA] ?? '').trim().toLowerCase();
      if (v) uniqueA.add(v);
    }
    for (const t of transactionsB) {
      const v = String(t.raw[rule.columnB] ?? '').trim().toLowerCase();
      if (v) uniqueB.add(v);
    }

    const totalPairs = uniqueA.size * uniqueB.size;

    if (totalPairs < 50_000) {
      for (const a of uniqueA) {
        for (const b of uniqueB) {
          const key = `${a}\0${b}`;
          const sim = normalizedSimilarity(a, b, threshold);
          if (sim > 0) pairCache.set(key, sim);
        }
      }
      pairCache.set('__precomputed__', 1);
    } else {
      pairCache.set('__skip_cache__', 1);
    }

    cache.set(cacheKey, pairCache);
  }

  return cache;
}

function ruleScore(
  rawA: Record<string, string>,
  rawB: Record<string, string>,
  rule: MatchingRule,
  simCache?: SimilarityCache
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
      const threshold = rule.similarityThreshold ?? 0.8;

      if (simCache) {
        const cacheKey = `${rule.columnA}::${rule.columnB}`;
        const pairCache = simCache.get(cacheKey);
        if (pairCache) {
          if (pairCache.has('__skip_cache__')) {
            const sim = normalizedSimilarity(a, b, threshold);
            return sim >= threshold ? sim : 0;
          }

          const key = `${a}\0${b}`;
          const cached = pairCache.get(key);
          if (cached !== undefined) return cached >= threshold ? cached : 0;

          if (pairCache.has('__precomputed__')) return 0;
        }
      }

      const similarity = normalizedSimilarity(a, b, threshold);
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
  rules: MatchingRule[],
  simCache?: SimilarityCache
): number {
  if (rules.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const rule of rules) {
    const w = rule.weight > 0 ? rule.weight : 1;
    weightedSum += ruleScore(ta.raw, tb.raw, rule, simCache) * w;
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
  const simCache = buildSimilarityCache(transactionsA, transactionsB, rules);
  type Pair = { a: Transaction; b: Transaction; score: number };
  const pairs: Pair[] = [];

  const numericRule = rules.find((r) => r.matchType === 'tolerance_numeric');

  if (numericRule) {
    const colA = numericRule.columnA;
    const colB = numericRule.columnB;
    const mode = numericRule.toleranceNumericMode ?? 'percentage';
    const rawTol = numericRule.toleranceValue ?? 0.1;

    const indexedB = transactionsB
      .map((b) => ({
        tx: b,
        amount: parseAmount(String(b.raw[colB] ?? '')),
      }))
      .sort((a, b) => a.amount - b.amount);

    const bAmounts = indexedB.map((x) => x.amount);

    function lowerBound(arr: number[], target: number): number {
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }

    function upperBound(arr: number[], target: number): number {
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] <= target) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }

    for (const a of transactionsA) {
      const amtA = parseAmount(String(a.raw[colA] ?? ''));
      const filterTol =
        mode === 'fixed'
          ? rawTol * 5
          : Math.max(amtA, 1) * rawTol * 5;

      const lo = lowerBound(bAmounts, amtA - filterTol);
      const hi = upperBound(bAmounts, amtA + filterTol);

      for (let i = lo; i < hi; i++) {
        const b = indexedB[i].tx;
        const score = pairScore(a, b, rules, simCache);
        if (score >= config.minConfidenceThreshold) {
          pairs.push({ a, b, score });
        }
      }
    }
  } else {
    const totalComparisons = transactionsA.length * transactionsB.length;
    if (totalComparisons > 10_000_000) {
      throw new Error(
        `Dataset too large for matching without amount rules: ${transactionsA.length} × ${transactionsB.length} = ${totalComparisons.toLocaleString()} comparisons. Add an amount matching rule to enable pre-filtering.`
      );
    }

    for (const a of transactionsA) {
      for (const b of transactionsB) {
        const score = pairScore(a, b, rules, simCache);
        if (score >= config.minConfidenceThreshold) {
          pairs.push({ a, b, score });
        }
      }
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

// ---------- HANDLER ----------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { csvA, csvB, filenameA, filenameB, config } = body;

    if (!csvA || !csvB || !config) {
      return new Response(
        JSON.stringify({ error: 'csvA, csvB, and config are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[match] Starting CSV parse...`);
    const parsedA = parseCsvText(csvA);
    const parsedB = parseCsvText(csvB);

    const totalRows = parsedA.rows.length + parsedB.rows.length;
    console.log(`[match] Parsed: ${parsedA.rows.length} x ${parsedB.rows.length} (${totalRows} total rows)`);

    if (totalRows > 200_000) {
      return new Response(
        JSON.stringify({ error: 'Dataset too large. Maximum 200,000 total rows.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { mappingA, mappingB } = deriveColumnMappingFromRules(
      config.rules,
      parsedA.headers,
      parsedB.headers
    );
    const transactionsA = normalizeToTransactions(parsedA.rows, mappingA, 'sourceA');
    const transactionsB = normalizeToTransactions(parsedB.rows, mappingB, 'sourceB');

    // Free CSV text memory
    (body as Record<string, unknown>).csvA = null;
    (body as Record<string, unknown>).csvB = null;

    console.log(`[match] Memory before matching - Transactions: ${transactionsA.length} + ${transactionsB.length}`);

    const startTime = Date.now();
    let result;
    try {
      result = runMatching(transactionsA, transactionsB, config);
    } catch (e) {
      console.error(`[match] Matching failed:`, e);
      return new Response(
        JSON.stringify({
          error: `Matching failed: ${(e as Error).message}. Try reducing dataset size or simplifying rules.`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const elapsed = Date.now() - startTime;
    console.log(`[match] Completed in ${elapsed}ms`);

    const serializeTx = (t: Transaction) => ({
      id: t.id,
      source: t.source,
      amount: t.amount,
      date: t.date instanceof Date ? t.date.toISOString() : t.date,
      reference: t.reference,
      rowIndex: t.rowIndex,
      raw: t.raw,
    });

    const total = transactionsA.length + transactionsB.length;
    const matchRate = total > 0 ? result.matched.length * 2 / total : 0;

    const response = {
      matched: result.matched.map((m: MatchResult) => ({
        transactionsA: m.transactionsA.map(serializeTx),
        transactionsB: m.transactionsB.map(serializeTx),
        confidence: m.confidence,
      })),
      unmatchedA: result.unmatchedA.map(serializeTx),
      unmatchedB: result.unmatchedB.map(serializeTx),
      config,
      stats: {
        totalA: transactionsA.length,
        totalB: transactionsB.length,
        matchedCount: result.matched.length,
        unmatchedACount: result.unmatchedA.length,
        unmatchedBCount: result.unmatchedB.length,
        matchRate,
        processingTimeMs: elapsed,
        elapsedMs: elapsed,
        engine: 'supabase-edge',
      },
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[match] Error:`, error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
