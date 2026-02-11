/**
 * Vercel serverless API route: Reconciliation Copilot.
 * Answers questions about reconciliation results using Claude with context.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are ReconcileX Copilot, an AI assistant specialized in financial reconciliation. You have access to the user's current reconciliation results and can answer questions about their data. Be concise, specific, and actionable. Use actual numbers from the data when answering. Format your response in plain text with occasional bold using **text** for emphasis. Do not use markdown headers. Keep responses under 300 words unless the user asks for detail.`;

interface CopilotRequestBody {
  question: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: {
    matchedCount: number;
    unmatchedACount: number;
    unmatchedBCount: number;
    matchRate: number;
    matchedAmount: number;
    unmatchedAmountA: number;
    unmatchedAmountB: number;
    sourceAName: string;
    sourceBName: string;
    sourceARows: number;
    sourceBRows: number;
    matchingType: string;
    rules: Array<{ columnA: string; columnB: string; matchType: string; weight: number }>;
    topUnmatchedA: Array<{
      rowIndex: number;
      amount: number;
      date: string;
      reference: string;
      raw: Record<string, string>;
    }>;
    topUnmatchedB: Array<{
      rowIndex: number;
      amount: number;
      date: string;
      reference: string;
      raw: Record<string, string>;
    }>;
    topMatched: Array<{
      confidence: number;
      amountA: number;
      amountB: number;
      referenceA: string;
      referenceB: string;
    }>;
    anomalySummary?: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      totalRiskScore: number;
    };
  };
}

interface CopilotResponse {
  answer: string;
}

function buildContextSummary(context: CopilotRequestBody['context']): string {
  const lines: string[] = [
    '## Reconciliation Summary',
    `- **Source A:** ${context.sourceAName} (${context.sourceARows} rows)`,
    `- **Source B:** ${context.sourceBName} (${context.sourceBRows} rows)`,
    `- **Matched:** ${context.matchedCount} pairs`,
    `- **Unmatched A:** ${context.unmatchedACount}`,
    `- **Unmatched B:** ${context.unmatchedBCount}`,
    `- **Match rate:** ${(context.matchRate * 100).toFixed(1)}%`,
    `- **Matched amount:** $${context.matchedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `- **Unmatched amount A:** $${context.unmatchedAmountA.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `- **Unmatched amount B:** $${context.unmatchedAmountB.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `- **Matching type:** ${context.matchingType}`,
    '',
    '## Matching Rules',
    ...context.rules.map(
      (r) => `- ${r.columnA} ↔ ${r.columnB}: ${r.matchType} (weight: ${(r.weight * 100).toFixed(0)}%)`
    ),
  ];

  if (context.topMatched.length > 0) {
    lines.push('', '## Sample Matched Pairs (top 10)');
    context.topMatched.forEach((m, i) => {
      lines.push(
        `${i + 1}. Confidence ${(m.confidence * 100).toFixed(0)}% | A: $${m.amountA.toFixed(2)} (${m.referenceA}) | B: $${m.amountB.toFixed(2)} (${m.referenceB})`
      );
    });
  }

  if (context.topUnmatchedA.length > 0) {
    lines.push('', '## Sample Unmatched from Source A (top 10)');
    context.topUnmatchedA.forEach((t, i) => {
      lines.push(
        `${i + 1}. Row ${t.rowIndex} | $${t.amount.toFixed(2)} | ${t.date} | ${t.reference}`
      );
    });
  }

  if (context.topUnmatchedB.length > 0) {
    lines.push('', '## Sample Unmatched from Source B (top 10)');
    context.topUnmatchedB.forEach((t, i) => {
      lines.push(
        `${i + 1}. Row ${t.rowIndex} | $${t.amount.toFixed(2)} | ${t.date} | ${t.reference}`
      );
    });
  }

  if (context.anomalySummary) {
    const a = context.anomalySummary;
    lines.push(
      '',
      '## Anomaly Summary',
      `- Critical: ${a.critical} | High: ${a.high} | Medium: ${a.medium} | Low: ${a.low}`,
      `- Total risk score: ${a.totalRiskScore.toFixed(0)}/100`
    );
  }

  return lines.join('\n');
}

async function callAnthropic(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemMessage: string,
  apiKey: string
): Promise<string> {
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
        system: systemMessage,
        messages,
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

  let body: CopilotRequestBody;
  try {
    body = req.body as CopilotRequestBody;
    if (!body || typeof body.question !== 'string' || !body.context) {
      res.status(400).json({
        error: 'Bad request',
        message: 'Request body must include: question, context',
      });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Bad request', message: 'Invalid JSON body' });
    return;
  }

  const conversationHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory : [];
  const contextSummary = buildContextSummary(body.context);
  const systemMessage = `${SYSTEM_PROMPT}\n\n## Current reconciliation data\n\n${contextSummary}`;

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...conversationHistory,
    { role: 'user' as const, content: body.question.trim() },
  ];

  try {
    const answer = await callAnthropic(messages, systemMessage, apiKey);
    const response: CopilotResponse = { answer };
    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const isClientError =
      message.includes('invalid') ||
      message.includes('400') ||
      message.includes('401') ||
      message.includes('429');

    if (isTimeout) {
      res.status(504).json({ error: 'Gateway timeout', message: 'Copilot request timed out.' });
      return;
    }
    if (isClientError) {
      res.status(400).json({ error: 'Copilot failed', message });
      return;
    }
    res.status(500).json({
      error: 'Copilot failed',
      message:
        process.env.NODE_ENV === 'development'
          ? message
          : 'An error occurred while processing your question.',
    });
  }
}
