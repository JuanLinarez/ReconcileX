import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Check } from 'lucide-react';
import type { ParsedCsv } from '@/features/reconciliation/types';
import type { MatchingConfig } from '@/features/reconciliation/types';
import { nextRuleId } from '@/features/matching-rules/defaultRules';
import { cn } from '@/lib/utils';

const EXAMPLE_SUGGESTIONS = [
  'Exact amount, date ±3 days, similar vendors',
  'Amount within 2%, date ±7 days',
  'Group: many payments to one invoice',
  'Invoice number + amount only',
];

export interface NLRulesInputProps {
  sourceA: ParsedCsv;
  sourceB: ParsedCsv;
  onConfigGenerated: (config: MatchingConfig, explanation: string) => void;
  className?: string;
}

interface ApiResponse {
  config: {
    rules: Array<{
      columnA: string;
      columnB: string;
      matchType: string;
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

function validateConfig(
  config: ApiResponse['config'],
  headersA: string[],
  headersB: string[]
): string | null {
  for (const rule of config.rules) {
    if (!headersA.includes(rule.columnA)) {
      return `Column "${rule.columnA}" not found in Source A. Available: ${headersA.join(', ')}`;
    }
    if (!headersB.includes(rule.columnB)) {
      return `Column "${rule.columnB}" not found in Source B. Available: ${headersB.join(', ')}`;
    }
  }
  const sum = config.rules.reduce((s, r) => s + r.weight, 0);
  if (Math.abs(sum - 1) > 0.01) {
    return `Rule weights must sum to 1.0 (got ${sum.toFixed(3)}).`;
  }
  return null;
}

function toMatchingConfig(apiConfig: ApiResponse['config']): MatchingConfig {
  const rules = apiConfig.rules.map((r) => {
    const matchType = r.matchType as MatchingConfig['rules'][0]['matchType'];
    const base = {
      id: nextRuleId(),
      columnA: r.columnA,
      columnB: r.columnB,
      matchType,
      weight: r.weight,
      nlGenerated: true,
    };
    if (matchType === 'tolerance_numeric') {
      return {
        ...base,
        toleranceValue: r.toleranceValue ?? 0.005,
        toleranceNumericMode: r.toleranceNumericMode ?? 'percentage',
      };
    }
    if (matchType === 'tolerance_date') {
      return { ...base, toleranceValue: r.toleranceValue ?? 3 };
    }
    if (matchType === 'similar_text') {
      return { ...base, similarityThreshold: r.similarityThreshold ?? 0.8 };
    }
    return base;
  });
  return {
    rules,
    minConfidenceThreshold: Math.max(0.5, Math.min(0.9, apiConfig.minConfidenceThreshold ?? 0.7)),
    matchingType: apiConfig.matchingType as 'oneToOne' | 'group',
  };
}

export function NLRulesInput({
  sourceA,
  sourceB,
  onConfigGenerated,
  className,
}: NLRulesInputProps) {
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ config: ApiResponse['config']; explanation: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const headersA = sourceA.headers;
  const headersB = sourceB.headers;
  const sampleRowsA = sourceA.rows.slice(0, 5), sampleRowsB = sourceB.rows.slice(0, 5);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 4.5 * 20)}px`;
  }, []);

  const handleGenerate = async () => {
    const trimmed = instruction.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/nl-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: trimmed,
          headersA,
          headersB,
          sampleRowsA,
          sampleRowsB,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = typeof data?.message === 'string' ? data.message : data?.error ?? `Request failed (${res.status})`;
        throw new Error(errMsg);
      }

      const apiResponse = data as ApiResponse;
      if (!apiResponse?.config?.rules || !Array.isArray(apiResponse.config.rules)) {
        throw new Error('AI returned an unexpected format. Please try again.');
      }

      const validationError = validateConfig(
        apiResponse.config,
        headersA,
        headersB
      );
      if (validationError) {
        throw new Error(validationError);
      }

      setResult({ config: apiResponse.config, explanation: apiResponse.explanation ?? '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!result) return;
    const config = toMatchingConfig(result.config);
    onConfigGenerated(config, result.explanation);
    setResult(null);
  };

  const handleTryAgain = () => {
    setResult(null);
    setError(null);
    setInstruction('');
    adjustTextareaHeight();
  };

  const handleRetry = () => {
    setError(null);
    handleGenerate();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div
      className={cn(
        'relative rounded-xl border border-border bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20 overflow-hidden',
        loading && 'animate-pulse',
        className
      )}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-blue-500 to-purple-500" />
      <div className="relative p-4 sm:p-5 pl-5 sm:pl-6 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-purple-600 dark:text-purple-400 shrink-0" />
            <h3 className="text-lg font-semibold">AI Rule Builder</h3>
            <span className="rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 text-xs font-medium">
              Beta
            </span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Describe your matching rules in plain English and AI will configure them for you
        </p>

        {result ? (
          /* Success state */
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <Check className="size-5 text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-sm font-medium text-green-800 dark:text-green-200">Rules created</p>
            </div>
            <p className="text-sm italic text-green-700 dark:text-green-300">{result.explanation}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleApply} size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                Apply Rules
              </Button>
              <Button onClick={handleTryAgain} variant="outline" size="sm">
                Try different prompt
              </Button>
            </div>
          </div>
        ) : (
          /* Input area */
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background dark:bg-background/95 px-3 py-2 shadow-sm">
              <textarea
                ref={textareaRef}
                value={instruction}
                onChange={(e) => {
                  setInstruction(e.target.value);
                  adjustTextareaHeight();
                }}
                onKeyDown={handleKeyDown}
                onInput={adjustTextareaHeight}
                placeholder="e.g. Match by amount within 1%, date within 5 days..."
                rows={1}
                disabled={loading}
                className="min-h-[2.25rem] max-h-[4.5rem] min-w-[12rem] flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Button
                onClick={handleGenerate}
                disabled={!instruction.trim() || loading}
                size="sm"
                className="shrink-0 rounded-lg bg-purple-600 px-4 py-1.5 hover:bg-purple-700 text-white gap-1.5"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Create Rules
                  </>
                )}
              </Button>
            </div>

            {/* Example chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Try:</span>
              {EXAMPLE_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setInstruction(suggestion);
                    setTimeout(adjustTextareaHeight, 0);
                  }}
                  className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:border-purple-300 dark:hover:border-purple-600 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30 cursor-pointer transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* Error state - below input */}
            {error && (
              <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-2 text-sm font-medium underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
