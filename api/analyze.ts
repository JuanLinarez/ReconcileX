/**
 * Vercel serverless API route: AI exception analysis for unmatched transactions.
 * Calls Anthropic Claude to analyze why a transaction didn't match and suggest actions.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 30_000;

/** Transaction as sent from frontend (dates are ISO strings). */
interface TransactionPayload {
  id: string;
  source: string;
  amount: number;
  date: string;
  reference: string;
  rowIndex: number;
  raw: Record<string, string>;
}

/** Match result payload. */
interface MatchResultPayload {
  transactionsA: TransactionPayload[];
  transactionsB: TransactionPayload[];
  confidence: number;
}

/** Matching rule payload. */
interface MatchingRulePayload {
  id: string;
  columnA: string;
  columnB: string;
  matchType: string;
  toleranceValue?: number;
  toleranceNumericMode?: string;
  similarityThreshold?: number;
  weight: number;
}

/** Request body. */
interface AnalyzeRequestBody {
  unmatchedTransaction: TransactionPayload;
  otherSourceTransactions: TransactionPayload[];
  matchedTransactions: MatchResultPayload[];
  matchingRules: MatchingRulePayload[];
  /** For follow-up: user question and previous AI response. */
  followUpQuestion?: string;
  previousAnalysis?: AnalyzeResponse;
}

/** Suggested match in the response. */
interface SuggestedMatchResponse {
  candidate: TransactionPayload;
  reason: string;
  confidence: 'High' | 'Medium' | 'Low';
  amountDiff?: number;
  dateDiffDays?: number;
  nameSimilarityPct?: number;
}

/** API response shape. */
interface AnalyzeResponse {
  probableCause: string;
  suggestedMatch?: SuggestedMatchResponse;
  recommendedAction: string;
  differenceDetails?: {
    amountDiff?: number;
    dateDiffDays?: number;
    referenceSimilarity?: number;
    [key: string]: unknown;
  };
}

function buildPrompt(body: AnalyzeRequestBody): string {
  const {
    unmatchedTransaction,
    otherSourceTransactions,
    matchedTransactions,
    matchingRules,
    followUpQuestion,
    previousAnalysis,
  } = body;

  if (followUpQuestion?.trim() && previousAnalysis) {
    return `You are an expert in financial reconciliation. The user previously received this AI analysis for an unmatched transaction and has a follow-up question.

## Previous analysis you gave
${JSON.stringify(previousAnalysis, null, 2)}

## User's follow-up question
${followUpQuestion.trim()}

Answer the user's question and, if appropriate, update your analysis. Respond with a single JSON object only, no markdown or extra text. Use this exact shape (same as before):
{
  "probableCause": "string",
  "suggestedMatch": { "candidate": <transaction object>, "reason": "string", "confidence": "High"|"Medium"|"Low", "amountDiff": number or null, "dateDiffDays": number or null, "nameSimilarityPct": number or null } or null,
  "recommendedAction": "string",
  "differenceDetails": { "amountDiff": number or null, "dateDiffDays": number or null, "referenceSimilarity": number or null } or null
}`;
  }

  const otherJson = JSON.stringify(otherSourceTransactions.slice(0, 50), null, 0);
  const matchedSummary = matchedTransactions.length;
  const rulesSummary = matchingRules
    .map(
      (r) =>
        `${r.columnA} ↔ ${r.columnB}: ${r.matchType}` +
        (r.toleranceValue != null ? ` (tolerance: ${r.toleranceValue})` : '')
    )
    .join('; ');

  return `You are an expert in financial reconciliation. Analyze why the following transaction did NOT match any transaction in the other source, and recommend an action.

## Unmatched transaction (from ${unmatchedTransaction.source})
- Row: ${unmatchedTransaction.rowIndex}
- Amount: ${unmatchedTransaction.amount}
- Date: ${unmatchedTransaction.date}
- Reference: ${unmatchedTransaction.reference}
- Raw fields: ${JSON.stringify(unmatchedTransaction.raw)}

## Matching rules that were used
${rulesSummary}

## Context
- There are ${matchedSummary} already matched pairs.
- Below are up to 50 transactions from the OTHER source (candidates that could have matched but didn't).

## Other source transactions (candidates)
${otherJson}

## Your task
1. Explain the **probable cause** of why this transaction didn't match (e.g. no matching amount within tolerance, date mismatch, reference mismatch).
2. If you can identify the **most likely match** from the other source list, provide it with: the candidate object, a short reason, and a confidence level (High/Medium/Low). Include differenceDetails: amountDiff, dateDiffDays, referenceSimilarity if applicable.
3. Give a **recommended action** for the user (e.g. "Increase amount tolerance to $X", "Manual match with row Y", "This appears to be a new transaction with no counterpart").

Respond with a single JSON object only, no markdown or extra text. Use this exact shape:
{
  "probableCause": "string",
  "suggestedMatch": { "candidate": <one transaction from other list>, "reason": "string", "confidence": "High"|"Medium"|"Low", "amountDiff": number or null, "dateDiffDays": number or null, "nameSimilarityPct": number or null } or null,
  "recommendedAction": "string",
  "differenceDetails": { "amountDiff": number or null, "dateDiffDays": number or null, "referenceSimilarity": number or null } or null
}`;
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user' as const, content: prompt }],
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      error?: { message: string };
    };

    if (data.error?.message) {
      throw new Error(data.error.message);
    }

    const textBlock = data.content?.find((b) => b.type === 'text');
    const text = textBlock?.text?.trim();
    if (!text) {
      throw new Error('No text in Anthropic response');
    }

    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseJsonResponse(text: string): AnalyzeResponse {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}') + 1;
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    throw new Error('Invalid JSON: no object found in response');
  }
  const jsonStr = trimmed.slice(jsonStart, jsonEnd);
  return JSON.parse(jsonStr) as AnalyzeResponse;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    res.status(500).json({
      error: 'Server configuration error',
      message: 'ANTHROPIC_API_KEY is not set. Add it in Vercel project environment variables.',
    });
    return;
  }

  let body: AnalyzeRequestBody;
  try {
    body = req.body as AnalyzeRequestBody;
    if (
      !body ||
      !body.unmatchedTransaction ||
      !Array.isArray(body.otherSourceTransactions) ||
      !Array.isArray(body.matchedTransactions) ||
      !Array.isArray(body.matchingRules)
    ) {
      res.status(400).json({
        error: 'Bad request',
        message:
          'Request body must include: unmatchedTransaction, otherSourceTransactions, matchedTransactions, matchingRules',
      });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Bad request', message: 'Invalid JSON body' });
    return;
  }

  try {
    const prompt = buildPrompt(body);
    const rawText = await callAnthropic(prompt, apiKey);
    const analysis = parseJsonResponse(rawText);
    res.status(200).json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const isClientError =
      message.includes('invalid') ||
      message.includes('400') ||
      message.includes('401') ||
      message.includes('429');

    if (isTimeout) {
      res.status(504).json({ error: 'Gateway timeout', message: 'Analysis request timed out.' });
      return;
    }
    if (isClientError) {
      res.status(400).json({ error: 'Analysis failed', message });
      return;
    }
    res.status(500).json({
      error: 'Analysis failed',
      message: process.env.NODE_ENV === 'development' ? message : 'An error occurred while analyzing the exception.',
    });
  }
}
