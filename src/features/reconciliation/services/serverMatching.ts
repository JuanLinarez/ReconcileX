import type { MatchingConfig, ParsedCsv, ReconciliationResult } from '../types';
import { serializeToCsv } from '../utils/parseCsv';

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

  const payloadSizeKB = ((csvA.length + csvB.length) / 1024).toFixed(0);
  console.log(
    `[serverMatching] Sending ${sourceA.rows.length} + ${sourceB.rows.length} rows as CSV (${payloadSizeKB}KB) to Vercel /api/match`
  );

  const response = await fetch('/api/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      csvA,
      csvB,
      filenameA: sourceA.filename ?? 'Source A',
      filenameB: sourceB.filename ?? 'Source B',
      config,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[serverMatching] Error ${response.status}:`, errorText);
    let errorMessage: string;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error || `Server matching failed: ${response.status}`;
    } catch {
      errorMessage = `Server matching failed: ${response.status} - ${errorText.substring(0, 200)}`;
    }
    throw new Error(errorMessage);
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
