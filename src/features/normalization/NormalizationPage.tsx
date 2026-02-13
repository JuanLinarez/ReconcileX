import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { CheckCircle, Sparkles, Wand2, Loader2 } from 'lucide-react';
import type { ParsedCsv } from '@/features/reconciliation/types';
import { scanDataQuality, applyAutoFix } from './dataQualityScanner';
import type { DataQualityIssue, ScanResult } from './dataQualityScanner';
import { runNormalization } from './normalizationService';
import type { NormalizeSuggestion } from './normalizationService';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import { ErrorAlert } from '@/components/ui/error-alert';

const headingStyle = { fontFamily: 'var(--font-heading)' };

export interface NormalizationPageProps {
  sourceA: ParsedCsv;
  sourceB: ParsedCsv;
  onComplete: (normalizedA: ParsedCsv, normalizedB: ParsedCsv) => void;
  onSkip: () => void;
}

function getBeforeAfterPreview(source: ParsedCsv, issue: DataQualityIssue): string | null {
  if (issue.affectedRows.length === 0) return null;
  const rowIdx = issue.affectedRows[0];
  const row = source.rows[rowIdx];
  if (!row || issue.column === 'all') return null;
  const before = String(row[issue.column] ?? '');
  if (!before) return null;

  if (issue.type === 'leading_trailing_whitespace') {
    return `Before: '${before}' → After: '${before.trim()}'`;
  }
  if (issue.type === 'mixed_case') {
    const toTitle = (s: string) =>
      s.toLowerCase().replace(/(?:^|\s)\w/g, (m) => m.toUpperCase());
    return `Before: '${before}' → After: '${toTitle(before)}'`;
  }
  if (issue.type === 'duplicate_rows') {
    return 'Remove duplicate rows';
  }
  if (issue.type === 'inconsistent_amount_format') {
    const normalized = before.replace(/[$€£\s]/g, '').replace(/,/g, '');
    return `Before: '${before}' → After: '${normalized}'`;
  }
  return null;
}

function severityClass(severity: string): string {
  switch (severity) {
    case 'high':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
    case 'low':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
    default:
      return '';
  }
}

function applyAiMappings(
  source: ParsedCsv,
  mappings: Array<{ column: string; original: string; normalized: string }>
): ParsedCsv {
  const mapByCol = new Map<string, Map<string, string>>();
  for (const m of mappings) {
    if (!mapByCol.has(m.column)) {
      mapByCol.set(m.column, new Map());
    }
    mapByCol.get(m.column)!.set(m.original, m.normalized);
  }
  const rows = source.rows.map((r) => {
    const next = { ...r };
    for (const [col, replacements] of mapByCol) {
      if (col in next) {
        const val = String(next[col] ?? '');
        const normalized = replacements.get(val);
        if (normalized !== undefined) {
          next[col] = normalized;
        }
      }
    }
    return next;
  });
  return { ...source, rows };
}

export function NormalizationPage({
  sourceA,
  sourceB,
  onComplete,
  onSkip,
}: NormalizationPageProps) {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<NormalizeSuggestion[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [acceptAutoFix, setAcceptAutoFix] = useState<Record<string, boolean>>({});
  const [acceptAiMapping, setAcceptAiMapping] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const result = scanDataQuality(sourceA, sourceB);
    setScanResult(result);
    const initial: Record<string, boolean> = {};
    for (const i of [...result.sourceA, ...result.sourceB]) {
      if (i.autoFixable) initial[i.id] = true;
    }
    setAcceptAutoFix(initial);
  }, [sourceA, sourceB]);

  useEffect(() => {
    if (scanResult?.totalIssues === 0) {
      const t = setTimeout(onSkip, 2000);
      return () => clearTimeout(t);
    }
  }, [scanResult?.totalIssues, onSkip]);

  const hasNonAutoFixable = useMemo(() => {
    if (!scanResult) return false;
    return [...scanResult.sourceA, ...scanResult.sourceB].some((i) => !i.autoFixable);
  }, [scanResult]);

  const handleGetAiSuggestions = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const { aiSuggestions: suggestions } = await runNormalization(sourceA, sourceB);
      if (suggestions?.suggestions) {
        setAiSuggestions(suggestions.suggestions);
        const initial: Record<string, boolean> = {};
        for (const s of suggestions.suggestions) {
          for (let i = 0; i < s.mappings.length; i++) {
            const key = `${s.issueType}-${s.column}-${s.mappings[i].original}`;
            initial[key] = true;
          }
        }
        setAcceptAiMapping(initial);
      }
    } catch (err) {
      setAiError(getFriendlyErrorMessage(err));
    } finally {
      setAiLoading(false);
    }
  };

  const acceptedAutoFixCount = useMemo(() => {
    return Object.values(acceptAutoFix).filter(Boolean).length;
  }, [acceptAutoFix]);

  const acceptedAiMappingCount = useMemo(() => {
    return Object.values(acceptAiMapping).filter(Boolean).length;
  }, [acceptAiMapping]);

  const totalAutoFixable = useMemo(() => {
    if (!scanResult) return 0;
    return [...scanResult.sourceA, ...scanResult.sourceB].filter((i) => i.autoFixable).length;
  }, [scanResult]);

  const totalAiMappings = useMemo(() => {
    if (!aiSuggestions) return 0;
    return aiSuggestions.reduce((s, sug) => s + sug.mappings.length, 0);
  }, [aiSuggestions]);

  const willFixCount = acceptedAutoFixCount + acceptedAiMappingCount;
  const totalFixable = totalAutoFixable + totalAiMappings;

  const handleApply = () => {
    let outA = { ...sourceA, rows: sourceA.rows.map((r) => ({ ...r })) };
    let outB = { ...sourceB, rows: sourceB.rows.map((r) => ({ ...r })) };

    const acceptedAutoIssuesA = scanResult!.sourceA.filter(
      (i) => i.autoFixable && acceptAutoFix[i.id]
    );
    const acceptedAutoIssuesB = scanResult!.sourceB.filter(
      (i) => i.autoFixable && acceptAutoFix[i.id]
    );
    outA = applyAutoFix(outA, acceptedAutoIssuesA);
    outB = applyAutoFix(outB, acceptedAutoIssuesB);

    if (aiSuggestions && acceptedAiMappingCount > 0) {
      const mappingsA: Array<{ column: string; original: string; normalized: string }> = [];
      const mappingsB: Array<{ column: string; original: string; normalized: string }> = [];
      for (const sug of aiSuggestions) {
        const colInA = sourceA.headers.includes(sug.column);
        const colInB = sourceB.headers.includes(sug.column);
        for (const m of sug.mappings) {
          const key = `${sug.issueType}-${sug.column}-${m.original}`;
          if (!acceptAiMapping[key]) continue;
          if (colInA) mappingsA.push({ column: sug.column, original: m.original, normalized: m.normalized });
          if (colInB) mappingsB.push({ column: sug.column, original: m.original, normalized: m.normalized });
        }
      }
      if (mappingsA.length > 0) outA = applyAiMappings(outA, mappingsA);
      if (mappingsB.length > 0) outB = applyAiMappings(outB, mappingsB);
    }

    onComplete(outA, outB);
  };

  if (!scanResult) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--app-body)]" />
      </div>
    );
  }

  if (scanResult.totalIssues === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
          <CheckCircle className="h-6 w-6 shrink-0 text-green-600 dark:text-green-400" />
          <div>
            <p className="font-medium text-green-800 dark:text-green-200" style={headingStyle}>
              Data looks clean — no issues detected
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              Advancing to Preview in 2 seconds…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
        <Sparkles className="h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="font-medium text-amber-800 dark:text-amber-200" style={headingStyle}>
            {scanResult.totalIssues} data quality issue{scanResult.totalIssues !== 1 ? 's' : ''} detected
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Fixing these issues can improve your match rate
          </p>
        </div>
      </div>

      <Tabs defaultValue="sourceA" className="w-full">
        <TabsList>
          <TabsTrigger value="sourceA">
            Source A ({scanResult.sourceA.length} issues)
          </TabsTrigger>
          <TabsTrigger value="sourceB">
            Source B ({scanResult.sourceB.length} issues)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sourceA" className="mt-4 space-y-4">
          {scanResult.sourceA.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              source={sourceA}
              accepted={acceptAutoFix[issue.id] ?? false}
              onToggle={(v) => setAcceptAutoFix((p) => ({ ...p, [issue.id]: v }))}
              aiSuggestion={aiSuggestions?.find(
                (s) => s.issueType === issue.type && s.column === issue.column
              )}
              acceptAiMapping={acceptAiMapping}
              onToggleAiMapping={(key, v) =>
                setAcceptAiMapping((p) => ({ ...p, [key]: v }))
              }
            />
          ))}
        </TabsContent>
        <TabsContent value="sourceB" className="mt-4 space-y-4">
          {scanResult.sourceB.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              source={sourceB}
              accepted={acceptAutoFix[issue.id] ?? false}
              onToggle={(v) => setAcceptAutoFix((p) => ({ ...p, [issue.id]: v }))}
              aiSuggestion={aiSuggestions?.find(
                (s) => s.issueType === issue.type && s.column === issue.column
              )}
              acceptAiMapping={acceptAiMapping}
              onToggleAiMapping={(key, v) =>
                setAcceptAiMapping((p) => ({ ...p, [key]: v }))
              }
            />
          ))}
        </TabsContent>
      </Tabs>

      {aiError && (
        <ErrorAlert
          message={aiError}
          onRetry={handleGetAiSuggestions}
          onDismiss={() => setAiError(null)}
        />
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--app-border)] bg-white py-4 dark:bg-background">
        <p className="text-sm text-[var(--app-body)]">
          {willFixCount} of {totalFixable} fix{totalFixable !== 1 ? 'es' : ''} will be applied
        </p>
        <div className="flex flex-wrap gap-2">
          {hasNonAutoFixable && (
            <Button
              variant="outline"
              onClick={handleGetAiSuggestions}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Get AI Suggestions
                </>
              )}
            </Button>
          )}
          <Button variant="outline" onClick={onSkip}>
            Skip Normalization
          </Button>
          <Button onClick={handleApply}>
            Apply Fixes & Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

interface IssueCardProps {
  issue: DataQualityIssue;
  source: ParsedCsv;
  accepted: boolean;
  onToggle: (v: boolean) => void;
  aiSuggestion?: NormalizeSuggestion;
  acceptAiMapping: Record<string, boolean>;
  onToggleAiMapping: (key: string, v: boolean) => void;
}

function IssueCard({
  issue,
  source,
  accepted,
  onToggle,
  aiSuggestion,
  acceptAiMapping,
  onToggleAiMapping,
}: IssueCardProps) {
  const preview = getBeforeAfterPreview(source, issue);
  return (
    <Card className="border-[var(--app-border)] bg-white">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={severityClass(issue.severity)}>
            {issue.severity}
          </Badge>
          {!issue.autoFixable && (
            <Badge variant="secondary" className="text-xs">
              Needs AI
            </Badge>
          )}
          <span className="text-sm font-medium text-[var(--app-body)]">
            {issue.column}
          </span>
        </div>
        <CardTitle className="text-base" style={headingStyle}>
          {issue.type.replace(/_/g, ' ')}
        </CardTitle>
        <p className="text-sm text-[var(--app-body)]">{issue.description}</p>
        <p className="text-xs text-[var(--app-body)]">
          Affects {issue.affectedRows.length} row{issue.affectedRows.length !== 1 ? 's' : ''}
        </p>
        {issue.autoFixable && preview && (
          <p className="text-xs text-[var(--app-body)]">{preview}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {issue.autoFixable && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => onToggle(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">Apply fix</span>
          </label>
        )}
        {!issue.autoFixable && !aiSuggestion && (
          <p className="text-xs text-[var(--app-body)] italic">
            Click &quot;Get AI Suggestions&quot; to see normalization options
          </p>
        )}
        {aiSuggestion && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--app-body)]">
              AI suggestions:
            </p>
            <div className="space-y-1.5">
              {aiSuggestion.mappings.map((m) => {
                const key = `${aiSuggestion!.issueType}-${aiSuggestion!.column}-${m.original}`;
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={acceptAiMapping[key] ?? false}
                      onChange={(e) => onToggleAiMapping(key, e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span>
                      <span className="text-muted-foreground">&quot;{m.original}&quot;</span>
                      {' → '}
                      <span className="font-medium">&quot;{m.normalized}&quot;</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'ml-1 text-xs',
                          m.confidence === 'high' && 'border-green-500 text-green-700',
                          m.confidence === 'medium' && 'border-yellow-500 text-yellow-700',
                          m.confidence === 'low' && 'border-slate-500 text-slate-600'
                        )}
                      >
                        {m.confidence}
                      </Badge>
                    </span>
                  </label>
                );
              })}
            </div>
            {aiSuggestion.explanation && (
              <p className="text-xs text-[var(--app-body)] italic">
                {aiSuggestion.explanation}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
