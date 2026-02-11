/**
 * Vercel serverless API route: AI-powered data normalization suggestions.
 * Calls Anthropic Claude to suggest normalizations for data quality issues.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 30_000;

interface NormalizeRequestBody {
  issues: Array<{
    type: string;
    column: string;
    sampleValues: string[];
    context: string;
  }>;
  sourceAHeaders: string[];
  sourceBHeaders: string[];
  sourceASample: Record<string, string>[];
  sourceBSample: Record<string, string>[];
}

interface NormalizeResponse {
  suggestions: Array<{
    issueType: string;
    column: string;
    mappings: Array<{
      original: string;
      normalized: string;
      confidence: 'high' | 'medium' | 'low';
    }>;
    explanation: string;
  }>;
}

function buildPrompt(body: NormalizeRequestBody): string {
  const { issues, sourceAHeaders, sourceBHeaders, sourceASample, sourceBSample } = body;

  const issuesJson = JSON.stringify(
    issues.map((i) => ({
      ...i,
      sampleValues: i.sampleValues.slice(0, 20),
    })),
    null,
    2
  );

  return `You are an expert in financial reconciliation and data quality. The user has financial reconciliation data from two sources (Source A and Source B) that need to be matched. Data quality issues have been detected that may prevent accurate matching.

## Data Quality Issues
${issuesJson}

## Source A Headers
${sourceAHeaders.join(', ')}

## Source B Headers
${sourceBHeaders.join(', ')}

## Source A Sample (first 10 rows)
${JSON.stringify(sourceASample.slice(0, 10), null, 0)}

## Source B Sample (first 10 rows)
${JSON.stringify(sourceBSample.slice(0, 10), null, 0)}

## Your Task
Analyze the data quality issues and suggest normalizations. The goal is to preserve meaning while making data consistent for matching. For example:
- vendor_name_variations: Suggest canonical forms for entity names (e.g., "J&J" → "Johnson & Johnson")
- inconsistent_date_format: Suggest which format to use and how to normalize
- empty_values: Suggest fill strategies if applicable
- special_characters_in_reference: Suggest how to remove or standardize

Respond with a single JSON object only, no markdown or extra text. Use this exact shape:
{
  "suggestions": [
    {
      "issueType": "string",
      "column": "string",
      "mappings": [
        { "original": "string", "normalized": "string", "confidence": "high"|"medium"|"low" }
      ],
      "explanation": "string"
    }
  ]
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

function parseJsonResponse(text: string): NormalizeResponse {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}') + 1;
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    throw new Error('Invalid JSON: no object found in response');
  }
  const jsonStr = trimmed.slice(jsonStart, jsonEnd);
  return JSON.parse(jsonStr) as NormalizeResponse;
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

  let body: NormalizeRequestBody;
  try {
    body = req.body as NormalizeRequestBody;
    if (
      !body ||
      !Array.isArray(body.issues) ||
      !Array.isArray(body.sourceAHeaders) ||
      !Array.isArray(body.sourceBHeaders) ||
      !Array.isArray(body.sourceASample) ||
      !Array.isArray(body.sourceBSample)
    ) {
      res.status(400).json({
        error: 'Bad request',
        message:
          'Request body must include: issues, sourceAHeaders, sourceBHeaders, sourceASample, sourceBSample',
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
    const response = parseJsonResponse(rawText);
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
      res.status(504).json({ error: 'Gateway timeout', message: 'Normalization request timed out.' });
      return;
    }
    if (isClientError) {
      res.status(400).json({ error: 'Normalization failed', message });
      return;
    }
    res.status(500).json({
      error: 'Normalization failed',
      message:
        process.env.NODE_ENV === 'development'
          ? message
          : 'An error occurred while analyzing the data.',
    });
  }
}
