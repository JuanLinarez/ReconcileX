import type { MatchingConfig, ParsedCsv, ReconciliationResult } from '../types';
import { serializeToCsv } from '../utils/parseCsv';

const MATCH_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/match-records`;

interface ServerMatchingInput {
  sourceA: ParsedCsv;
  sourceB: ParsedCsv;
  config: MatchingConfig;
}

export async function runServerMatching({
  sourceA,
  sourceB,
  config,
}: ServerMatchingInput): Promise<ReconciliationResult> {
  const csvA = serializeToCsv(sourceA.headers, sourceA.rows);
  const csvB = serializeToCsv(sourceB.headers, sourceB.rows);

  console.log(
    `[serverMatching] Sending ${sourceA.rows.length} + ${sourceB.rows.length} rows as CSV (${((csvA.length + csvB.length) / 1024).toFixed(0)}KB)`
  );

  const response = await fetch(MATCH_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      csvA,
      csvB,
      filenameA: sourceA.filename ?? 'Source A',
      filenameB: sourceB.filename ?? 'Source B',
      config,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || `Server matching failed: ${response.status}`);
  }

  const data = await response.json();

  const deserializeTx = (t: unknown): Record<string, unknown> & { date: Date } => {
    const o = t as Record<string, unknown> & { date?: string };
    return {
      ...o,
      date: o.date ? new Date(o.date) : new Date(NaN),
    };
  };

  return {
    matched: data.matched.map((m: { transactionsA: unknown[]; transactionsB: unknown[]; confidence: number }) => ({
      transactionsA: m.transactionsA.map(deserializeTx),
      transactionsB: m.transactionsB.map(deserializeTx),
      confidence: m.confidence,
    })),
    unmatchedA: data.unmatchedA.map(deserializeTx),
    unmatchedB: data.unmatchedB.map(deserializeTx),
    config: data.config,
  };
}
