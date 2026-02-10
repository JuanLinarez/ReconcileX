/**
 * AI Exception Analysis: types and API client for /api/analyze.
 */

import type { MatchResult, MatchingConfig, Transaction } from '@/features/reconciliation/types';

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface SuggestedMatchCandidate {
  transaction: Transaction;
  reason: string;
  confidence: ConfidenceLevel;
  amountDiff?: number;
  dateDiffDays?: number;
  nameSimilarityPct?: number;
}

export interface ExceptionAnalysis {
  probableCause: string;
  suggestedMatch?: SuggestedMatchCandidate;
  recommendedAction: string;
}

/** Payload sent to API (dates as ISO strings). */
interface TransactionPayload {
  id: string;
  source: string;
  amount: number;
  date: string;
  reference: string;
  rowIndex: number;
  raw: Record<string, string>;
}

/** API response (candidate.date may be string). */
interface AnalyzeApiResponse {
  probableCause: string;
  suggestedMatch?: {
    candidate: TransactionPayload;
    reason: string;
    confidence: ConfidenceLevel;
    amountDiff?: number;
    dateDiffDays?: number;
    nameSimilarityPct?: number;
  };
  recommendedAction: string;
}

function transactionToPayload(t: Transaction): TransactionPayload {
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

function payloadToTransaction(p: TransactionPayload, source: 'sourceA' | 'sourceB'): Transaction {
  return {
    id: p.id,
    source,
    amount: p.amount,
    date: typeof p.date === 'string' ? new Date(p.date) : new Date(p.date),
    reference: p.reference,
    rowIndex: p.rowIndex,
    raw: p.raw,
  };
}

function mapApiResponseToAnalysis(
  res: AnalyzeApiResponse,
  otherSource: 'sourceA' | 'sourceB'
): ExceptionAnalysis {
  const suggestedMatch = res.suggestedMatch
    ? {
        transaction: payloadToTransaction(res.suggestedMatch.candidate, otherSource),
        reason: res.suggestedMatch.reason,
        confidence: res.suggestedMatch.confidence,
        amountDiff: res.suggestedMatch.amountDiff,
        dateDiffDays: res.suggestedMatch.dateDiffDays,
        nameSimilarityPct: res.suggestedMatch.nameSimilarityPct,
      }
    : undefined;

  return {
    probableCause: res.probableCause,
    suggestedMatch,
    recommendedAction: res.recommendedAction,
  };
}

export interface FetchAnalyzeParams {
  unmatchedTransaction: Transaction;
  otherSourceTransactions: Transaction[];
  matchedTransactions: MatchResult[];
  matchingRules: MatchingConfig['rules'];
  followUpQuestion?: string;
  previousAnalysis?: ExceptionAnalysis;
}

export type FetchAnalyzeResult =
  | { success: true; analysis: ExceptionAnalysis }
  | { success: false; error: string; isNetwork: boolean };

/**
 * Call POST /api/analyze and return parsed analysis or error.
 * otherSourceTransactions = all transactions from the OTHER source (matched + unmatched).
 */
export async function fetchAnalyzeException(
  params: FetchAnalyzeParams
): Promise<FetchAnalyzeResult> {
  const {
    unmatchedTransaction,
    otherSourceTransactions,
    matchedTransactions,
    matchingRules,
    followUpQuestion,
    previousAnalysis,
  } = params;

  const otherSource = unmatchedTransaction.source === 'sourceA' ? 'sourceB' : 'sourceA';

  const body = {
    unmatchedTransaction: transactionToPayload(unmatchedTransaction),
    otherSourceTransactions: otherSourceTransactions.map(transactionToPayload),
    matchedTransactions: matchedTransactions.map((m) => ({
      transactionsA: m.transactionsA.map(transactionToPayload),
      transactionsB: m.transactionsB.map(transactionToPayload),
      confidence: m.confidence,
    })),
    matchingRules: matchingRules.map((r) => ({
      id: r.id,
      columnA: r.columnA,
      columnB: r.columnB,
      matchType: r.matchType,
      toleranceValue: r.toleranceValue,
      toleranceNumericMode: r.toleranceNumericMode,
      similarityThreshold: r.similarityThreshold,
      weight: r.weight,
    })),
    ...(followUpQuestion?.trim() && previousAnalysis
      ? {
          followUpQuestion: followUpQuestion.trim(),
          previousAnalysis: {
            probableCause: previousAnalysis.probableCause,
            suggestedMatch: previousAnalysis.suggestedMatch
              ? {
                  candidate: transactionToPayload(previousAnalysis.suggestedMatch.transaction),
                  reason: previousAnalysis.suggestedMatch.reason,
                  confidence: previousAnalysis.suggestedMatch.confidence,
                  amountDiff: previousAnalysis.suggestedMatch.amountDiff,
                  dateDiffDays: previousAnalysis.suggestedMatch.dateDiffDays,
                  nameSimilarityPct: previousAnalysis.suggestedMatch.nameSimilarityPct,
                }
              : undefined,
            recommendedAction: previousAnalysis.recommendedAction,
          },
        }
      : {}),
  };

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message =
        typeof data?.message === 'string'
          ? data.message
          : data?.error ?? `Request failed (${res.status})`;
      return {
        success: false,
        error: message,
        isNetwork: false,
      };
    }

    const analysis = mapApiResponseToAnalysis(data as AnalyzeApiResponse, otherSource);
    return { success: true, analysis };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const isNetwork =
      message.includes('fetch') ||
      message.includes('NetworkError') ||
      message.includes('Failed to fetch') ||
      err instanceof TypeError;
    return {
      success: false,
      error: isNetwork ? 'Could not connect to AI service. Check your connection.' : message,
      isNetwork,
    };
  }
}
