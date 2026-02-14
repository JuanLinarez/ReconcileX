import { serializeToCsv } from '../utils/parseCsv';
import { supabase } from '@/lib/supabase';
import type {
  ParsedCsv,
  ReconciliationResult,
  MatchingConfig,
  Transaction,
  MatchResult,
  RawCsvRow,
  ColumnMapping,
} from '../types';
import { deriveColumnMappingFromRules } from '../engine/matchingEngine';

// Threshold: if combined CSV text exceeds this, use Storage transport
const STORAGE_THRESHOLD_BYTES = 3.5 * 1024 * 1024; // 3.5MB

interface ServerMatchingInput {
  sourceA: ParsedCsv;
  sourceB: ParsedCsv;
  config: MatchingConfig;
  organizationId?: string;
}

/**
 * Reconstruct full Transaction objects from raw parsed data.
 * Mirrors the normalizeToTransactions logic in the matching engine.
 */
function reconstructTransactions(
  rows: RawCsvRow[],
  columnMapping: ColumnMapping,
  source: 'A' | 'B'
): Transaction[] {
  return rows.map((row, index) => {
    const amountStr = row[columnMapping.amount] ?? '0';
    const amount = parseFloat(amountStr.replace(/[^0-9.\-]/g, '')) || 0;
    const dateStr = row[columnMapping.date] ?? '';
    let date = new Date(dateStr);
    if (isNaN(date.getTime())) date = new Date();
    const reference = (row[columnMapping.reference] ?? '').trim() || `Row ${index + 1}`;

    return {
      id: `source${source}-${index + 1}-reconstructed`,
      source: source === 'A' ? ('sourceA' as const) : ('sourceB' as const),
      amount,
      date,
      reference,
      rowIndex: index + 1,
      raw: row,
    };
  });
}

/**
 * Reconstruct ReconciliationResult from index-based server response
 * using local parsed data.
 */
function reconstructFromIndices(
  data: {
    matchedPairs?: Array<{ indexA: number; indexB: number; confidence: number }>;
    unmatchedIndicesA?: number[];
    unmatchedIndicesB?: number[];
    nearMissScores?: Record<string, { bestScore: number; bestCandidateRowIndex: number }>;
    config?: MatchingConfig;
  },
  sourceA: ParsedCsv,
  sourceB: ParsedCsv,
  config: MatchingConfig
): ReconciliationResult {
  const { mappingA, mappingB } = deriveColumnMappingFromRules(
    config.rules,
    sourceA.headers,
    sourceB.headers
  );
  const txA = reconstructTransactions(sourceA.rows, mappingA, 'A');
  const txB = reconstructTransactions(sourceB.rows, mappingB, 'B');

  const matched: MatchResult[] = (data.matchedPairs ?? []).map((pair) => ({
    transactionsA: [txA[pair.indexA]],
    transactionsB: [txB[pair.indexB]],
    confidence: pair.confidence,
  }));

  const unmatchedAIndices = new Set<number>(data.unmatchedIndicesA ?? []);
  const unmatchedBIndices = new Set<number>(data.unmatchedIndicesB ?? []);

  return {
    matched,
    unmatchedA: txA.filter((_, i) => unmatchedAIndices.has(i)),
    unmatchedB: txB.filter((_, i) => unmatchedBIndices.has(i)),
    config: data.config ?? config,
    nearMissScores: data.nearMissScores ?? {},
  };
}

/**
 * Reconstruct ReconciliationResult from full transaction response (current format).
 */
function reconstructFromFull(data: {
  matched: Array<{
    transactionsA?: unknown[];
    transactionA?: unknown;
    transactionsB?: unknown[];
    transactionB?: unknown;
    groupTransactionsB?: unknown[];
    confidence: number;
  }>;
  unmatchedA: unknown[];
  unmatchedB: unknown[];
  nearMissScores?: Record<string, { bestScore: number; bestCandidateRowIndex: number }>;
  config: MatchingConfig;
}): ReconciliationResult {
  const deserializeTx = (t: unknown): Transaction => {
    const o = t as Record<string, unknown> & { date?: string };
    return {
      ...o,
      date: o.date ? new Date(o.date) : new Date(NaN),
    } as Transaction;
  };

  return {
    matched: data.matched.map((m) => ({
      transactionsA: (m.transactionsA ?? (m.transactionA ? [m.transactionA] : [])).map(deserializeTx),
      transactionsB: (m.transactionsB ??
        (m.transactionB ? [m.transactionB] : m.groupTransactionsB ?? [])).map(deserializeTx),
      confidence: m.confidence,
    })),
    unmatchedA: data.unmatchedA.map(deserializeTx),
    unmatchedB: data.unmatchedB.map(deserializeTx),
    config: data.config,
    nearMissScores: data.nearMissScores ?? {},
  };
}

export async function runServerMatching({
  sourceA,
  sourceB,
  config,
  organizationId,
}: ServerMatchingInput): Promise<ReconciliationResult> {
  const csvA = serializeToCsv(sourceA.headers, sourceA.rows);
  const csvB = serializeToCsv(sourceB.headers, sourceB.rows);
  const combinedSize = csvA.length + csvB.length;

  const payloadSizeKB = (combinedSize / 1024).toFixed(0);
  console.log(
    `[serverMatching] ${sourceA.rows.length} + ${sourceB.rows.length} rows, CSV size: ${payloadSizeKB}KB`
  );

  const useStorage = combinedSize >= STORAGE_THRESHOLD_BYTES && !!organizationId;

  if (useStorage) {
    return runViaStorage(csvA, csvB, sourceA, sourceB, config, organizationId);
  } else {
    return runViaDirect(csvA, csvB, sourceA, sourceB, config);
  }
}

/**
 * TIER 2: Send CSV text directly in POST body.
 * Works for datasets up to ~30K rows (~3.5MB).
 */
async function runViaDirect(
  csvA: string,
  csvB: string,
  sourceA: ParsedCsv,
  sourceB: ParsedCsv,
  config: MatchingConfig
): Promise<ReconciliationResult> {
  console.log(`[serverMatching] Using DIRECT transport`);

  const response = await fetch('/api/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      csvA,
      csvB,
      filenameA: sourceA.filename,
      filenameB: sourceB.filename,
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
  return reconstructFromFull(data);
}

/**
 * TIER 3: Upload CSVs to Supabase Storage, send signed URLs to Vercel.
 * Works for datasets of any size (up to Vercel's 300s timeout).
 */
async function runViaStorage(
  csvA: string,
  csvB: string,
  sourceA: ParsedCsv,
  sourceB: ParsedCsv,
  config: MatchingConfig,
  organizationId: string
): Promise<ReconciliationResult> {
  const sessionId = crypto.randomUUID();
  const pathA = `${organizationId}/${sessionId}/sourceA.csv`;
  const pathB = `${organizationId}/${sessionId}/sourceB.csv`;
  const bucket = 'reconciliation-files';

  console.log(`[serverMatching] Using STORAGE transport (session: ${sessionId})`);

  try {
    // 1. Upload CSVs to Supabase Storage
    console.log(`[serverMatching] Uploading sourceA (${(csvA.length / 1024).toFixed(0)}KB)...`);
    const blobA = new Blob([csvA], { type: 'text/csv' });
    const { error: uploadErrorA } = await supabase.storage
      .from(bucket)
      .upload(pathA, blobA, { contentType: 'text/csv', upsert: false });
    if (uploadErrorA) throw new Error(`Failed to upload sourceA: ${uploadErrorA.message}`);

    console.log(`[serverMatching] Uploading sourceB (${(csvB.length / 1024).toFixed(0)}KB)...`);
    const blobB = new Blob([csvB], { type: 'text/csv' });
    const { error: uploadErrorB } = await supabase.storage
      .from(bucket)
      .upload(pathB, blobB, { contentType: 'text/csv', upsert: false });
    if (uploadErrorB) throw new Error(`Failed to upload sourceB: ${uploadErrorB.message}`);

    // 2. Create signed URLs (5 min expiry)
    const { data: urlDataA, error: urlErrorA } = await supabase.storage
      .from(bucket)
      .createSignedUrl(pathA, 300);
    if (urlErrorA || !urlDataA)
      throw new Error(`Failed to create signed URL for sourceA: ${urlErrorA?.message}`);

    const { data: urlDataB, error: urlErrorB } = await supabase.storage
      .from(bucket)
      .createSignedUrl(pathB, 300);
    if (urlErrorB || !urlDataB)
      throw new Error(`Failed to create signed URL for sourceB: ${urlErrorB?.message}`);

    console.log(`[serverMatching] Files uploaded. Starting server matching...`);

    // 3. Call /api/match with signed URLs (tiny payload)
    const response = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storageUrlA: urlDataA.signedUrl,
        storageUrlB: urlDataB.signedUrl,
        config,
        responseMode: 'indices',
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

    // 4. Reconstruct result from indices
    const data = await response.json();
    console.log(`[serverMatching] Matching complete. Reconstructing results...`);

    if (data.mode === 'indices') {
      return reconstructFromIndices(data, sourceA, sourceB, config);
    } else {
      return reconstructFromFull(data);
    }
  } finally {
    // 5. Cleanup: delete temporary files (fire and forget)
    console.log(`[serverMatching] Cleaning up storage files...`);
    supabase.storage
      .from(bucket)
      .remove([pathA, pathB])
      .catch((err) => {
        console.warn(`[serverMatching] Cleanup warning:`, err);
      });
  }
}
