/**
 * Vercel serverless API route: Natural Language Rules.
 * Generates MatchingConfig from plain English instructions using Claude.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are a financial reconciliation expert. The user will describe in plain language how they want to match transactions between two data sources. You must generate a precise matching configuration.

Available match types:
- exact: strings must be identical (case-insensitive)
- tolerance_numeric: numbers within ± tolerance. toleranceNumericMode can be 'fixed' (dollar amount) or 'percentage' (0-1 decimal, e.g. 0.005 = 0.5%)
- tolerance_date: dates within ± N days (toleranceValue = number of days)
- similar_text: fuzzy text matching, similarityThreshold 0-1 (e.g. 0.8 = 80% similarity)
- contains: one value contains the other

Rules:
- weights must sum to exactly 1.0
- minConfidenceThreshold should be between 0.5 and 0.9
- matchingType: 'oneToOne' for standard matching, 'group' for 1:Many or Many:1
- columnA must be from Source A headers, columnB must be from Source B headers
- Generate 2-4 rules maximum
- Prioritize: amount matching should have highest weight, then date, then reference/ID

Your entire response must be valid JSON. Do not wrap in markdown code blocks. Do not add any text before or after the JSON.

Use this exact shape:
{
  "config": { "rules": [...], "minConfidenceThreshold": number, "matchingType": "oneToOne" | "group" },
  "explanation": "Brief explanation of what rules were created and why"
}`;

interface NLRulesRequestBody {
  instruction: string;
  headersA: string[];
  headersB: string[];
  sampleRowsA: Record<string, string>[];
  sampleRowsB: Record<string, string>[];
}

interface NLRulesResponse {
  config: {
    rules: Array<{
      columnA: string;
      columnB: string;
      matchType: 'exact' | 'tolerance_numeric' | 'tolerance_date' | 'similar_text' | 'contains';
      toleranceValue?: number;
      toleranceNumericMode?: 'fixed' | 'percentage';
      similarityThreshold?: number;
      weight: number;
    }>;
    minConfidenceThreshold: number;
    matchingType: 'oneToOne' | 'group';
  };
  explanation: string;
}

function buildUserPrompt(body: NLRulesRequestBody): string {
  const { instruction, headersA, headersB, sampleRowsA, sampleRowsB } = body;
  return `## Source A headers
${JSON.stringify(headersA)}

## Source B headers
${JSON.stringify(headersB)}

## Sample rows from Source A (first 5)
${JSON.stringify(sampleRowsA.slice(0, 5), null, 2)}

## Sample rows from Source B (first 5)
${JSON.stringify(sampleRowsB.slice(0, 5), null, 2)}

## User instruction
${instruction.trim()}

Generate the matching configuration as JSON.`;
}

async function callAnthropic(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
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
        system: systemPrompt,
        messages: [{ role: 'user' as const, content: userPrompt }],
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

/** Strip markdown code fences (```json ... ``` or ``` ... ```). */
function stripMarkdownFences(text: string): string {
  let s = text.trim();
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }
  return s;
}

/** Extract raw JSON object from text (handles preamble/suffix). */
function extractJson(text: string): string {
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}') + 1;
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    throw new Error('Invalid JSON: no object found in response');
  }
  return text.slice(jsonStart, jsonEnd);
}

function parseJsonResponse(text: string): NLRulesResponse {
  const stripped = stripMarkdownFences(text);
  let jsonStr = extractJson(stripped);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    jsonStr = extractJson(text.trim());
    parsed = JSON.parse(jsonStr);
  }
  const obj = parsed as Record<string, unknown>;
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid JSON: expected an object');
  }
  if (obj.config && typeof obj.config === 'object') {
    return { config: obj.config as NLRulesResponse['config'], explanation: String(obj.explanation ?? '') };
  }
  if (Array.isArray(obj.rules)) {
    return {
      config: {
        rules: obj.rules as NLRulesResponse['config']['rules'],
        minConfidenceThreshold: Number(obj.minConfidenceThreshold) || 0.7,
        matchingType: (obj.matchingType as 'oneToOne' | 'group') || 'oneToOne',
      },
      explanation: String(obj.explanation ?? ''),
    };
  }
  throw new Error('Invalid JSON: expected config.rules or rules array');
}

function validateAndNormalizeResponse(
  response: NLRulesResponse,
  headersA: string[],
  headersB: string[]
): NLRulesResponse {
  const config = response.config;
  if (!config) {
    throw new Error('Response missing config');
  }
  if (!Array.isArray(config.rules) || config.rules.length < 1) {
    throw new Error('Config must have at least one rule');
  }
  for (const rule of config.rules) {
    if (!rule || typeof rule !== 'object') {
      throw new Error('Each rule must be an object');
    }
    if (!rule.columnA || typeof rule.columnA !== 'string') {
      throw new Error('Each rule must have columnA');
    }
    if (!rule.columnB || typeof rule.columnB !== 'string') {
      throw new Error('Each rule must have columnB');
    }
    if (!rule.matchType || typeof rule.matchType !== 'string') {
      throw new Error('Each rule must have matchType');
    }
    if (typeof rule.weight !== 'number') {
      throw new Error('Each rule must have weight');
    }
    if (!headersA.includes(rule.columnA)) {
      throw new Error(`Column "${rule.columnA}" not found in Source A. Available: ${headersA.join(', ')}`);
    }
    if (!headersB.includes(rule.columnB)) {
      throw new Error(`Column "${rule.columnB}" not found in Source B. Available: ${headersB.join(', ')}`);
    }
  }
  const sum = config.rules.reduce((s, r) => s + r.weight, 0);
  if (Math.abs(sum - 1) > 0.05) {
    const factor = 1 / sum;
    for (const r of config.rules) {
      r.weight *= factor;
    }
  }
  return response;
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

  let body: NLRulesRequestBody;
  try {
    body = req.body as NLRulesRequestBody;
    if (
      !body ||
      typeof body.instruction !== 'string' ||
      !Array.isArray(body.headersA) ||
      !Array.isArray(body.headersB)
    ) {
      res.status(400).json({
        error: 'Bad request',
        message: 'Request body must include: instruction, headersA, headersB',
      });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Bad request', message: 'Invalid JSON body' });
    return;
  }

  try {
    const prompt = buildUserPrompt(body);
    const rawText = await callAnthropic(SYSTEM_PROMPT, prompt, apiKey);
    if (process.env.NODE_ENV === 'development') {
      console.log('[nl-rules] Raw Claude response:', rawText.substring(0, 500) + (rawText.length > 500 ? '...' : ''));
    }
    const response = parseJsonResponse(rawText);
    const validated = validateAndNormalizeResponse(response, body.headersA, body.headersB);
    res.status(200).json(validated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const isValidation =
      message.includes('not found') ||
      message.includes('must have') ||
      message.includes('missing') ||
      message.includes('Invalid JSON');
    const isClientError =
      message.includes('invalid') ||
      message.includes('400') ||
      message.includes('401') ||
      message.includes('429');

    if (isTimeout) {
      res.status(504).json({ error: 'Gateway timeout', message: 'Request timed out.' });
      return;
    }
    if (isValidation) {
      res.status(422).json({ error: 'Validation failed', message });
      return;
    }
    if (isClientError) {
      res.status(400).json({ error: 'NL rules failed', message });
      return;
    }
    res.status(500).json({
      error: 'NL rules failed',
      message:
        process.env.NODE_ENV === 'development'
          ? message
          : 'An error occurred while generating rules.',
    });
  }
}
