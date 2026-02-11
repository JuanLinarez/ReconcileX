/**
 * Orchestrates the normalization flow: scan + optional AI suggestions.
 */

import type { ParsedCsv } from '@/features/reconciliation/types';
import { scanDataQuality } from './dataQualityScanner';
import type { DataQualityIssue, ScanResult } from './dataQualityScanner';

export interface NormalizeSuggestion {
  issueType: string;
  column: string;
  mappings: Array<{
    original: string;
    normalized: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  explanation: string;
}

export interface NormalizeResponse {
  suggestions: NormalizeSuggestion[];
}

export interface RunNormalizationResult {
  scanResult: ScanResult;
  aiSuggestions: NormalizeResponse | null;
}

function getSampleValues(
  source: ParsedCsv,
  issue: DataQualityIssue,
  maxSamples: number
): string[] {
  const values = new Set<string>();
  for (const rowIdx of issue.affectedRows) {
    if (rowIdx >= source.rows.length) continue;
    const row = source.rows[rowIdx];
    const val = issue.column === 'all' ? JSON.stringify(row) : String(row[issue.column] ?? '');
    if (val.trim()) values.add(val);
    if (values.size >= maxSamples) break;
  }
  return Array.from(values).slice(0, maxSamples);
}

export async function runNormalization(
  sourceA: ParsedCsv,
  sourceB: ParsedCsv
): Promise<RunNormalizationResult> {
  const scanResult = scanDataQuality(sourceA, sourceB);

  if (!scanResult.needsAiNormalization || scanResult.totalIssues === 0) {
    return { scanResult, aiSuggestions: null };
  }

  const nonAutoFixable = [
    ...scanResult.sourceA.filter((i) => !i.autoFixable),
    ...scanResult.sourceB.filter((i) => !i.autoFixable),
  ];

  if (nonAutoFixable.length === 0) {
    return { scanResult, aiSuggestions: null };
  }

  const issuesPayload = nonAutoFixable.map((issue) => {
    const source = scanResult.sourceA.includes(issue)
      ? sourceA
      : sourceB;
    const sampleValues = getSampleValues(source, issue, 20);
    return {
      type: issue.type,
      column: issue.column,
      sampleValues,
      context: issue.description,
    };
  });

  const sourceASample = sourceA.rows.slice(0, 10).map((r) => ({ ...r }));
  const sourceBSample = sourceB.rows.slice(0, 10).map((r) => ({ ...r }));

  try {
    const res = await fetch('/api/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issues: issuesPayload,
        sourceAHeaders: sourceA.headers,
        sourceBHeaders: sourceB.headers,
        sourceASample,
        sourceBSample,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('normalize API error', res.status, data);
      return { scanResult, aiSuggestions: null };
    }

    if (data?.suggestions && Array.isArray(data.suggestions)) {
      return { scanResult, aiSuggestions: data as NormalizeResponse };
    }

    return { scanResult, aiSuggestions: null };
  } catch (err) {
    console.error('runNormalization', err);
    return { scanResult, aiSuggestions: null };
  }
}
