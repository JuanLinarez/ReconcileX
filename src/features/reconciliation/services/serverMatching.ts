import type {
  MatchingConfig,
  ReconciliationResult,
  ParsedCsv,
  Transaction,
} from '../types';

export interface ServerMatchingResponse {
  matched: Array<{
    transactionsA: Array<Transaction & { date: string }>;
    transactionsB: Array<Transaction & { date: string }>;
    confidence: number;
  }>;
  unmatchedA: Array<Transaction & { date: string }>;
  unmatchedB: Array<Transaction & { date: string }>;
  config: MatchingConfig;
  stats: {
    matchedCount: number;
    unmatchedACount: number;
    unmatchedBCount: number;
    matchRate: number;
    processingTimeMs: number;
  };
}

function convertDates<T extends { date: string }>(transactions: T[]): (Omit<T, 'date'> & { date: Date })[] {
  return transactions.map((t) => ({
    ...t,
    date: new Date(t.date),
  }));
}

export async function runServerMatching(
  sourceA: ParsedCsv,
  sourceB: ParsedCsv,
  config: MatchingConfig
): Promise<ReconciliationResult> {
  const response = await fetch('/api/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceA: { headers: sourceA.headers, rows: sourceA.rows, filename: sourceA.filename },
      sourceB: { headers: sourceB.headers, rows: sourceB.rows, filename: sourceB.filename },
      config,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Server matching failed' }));
    throw new Error(error.message || `Server error: ${response.status}`);
  }

  const data: ServerMatchingResponse = await response.json();

  return {
    matched: data.matched.map((m) => ({
      transactionsA: convertDates(m.transactionsA) as Transaction[],
      transactionsB: convertDates(m.transactionsB) as Transaction[],
      confidence: m.confidence,
    })),
    unmatchedA: convertDates(data.unmatchedA) as Transaction[],
    unmatchedB: convertDates(data.unmatchedB) as Transaction[],
    config: data.config,
  };
}
