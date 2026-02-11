import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Info, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import type {
  MatchingConfig,
  MatchingRule,
  MatchingType,
  ToleranceNumericMode,
} from '@/features/reconciliation/types';
import type { ParsedCsv, ReconciliationResult } from '@/features/reconciliation/types';
import { nextRuleId, getDefaultRules } from './defaultRules';
import { getMaxFixedTolerance } from './numericToleranceUtils';
import { buildSuggestedRules } from './smartColumnSuggestions';
import { enhanceSuggestedRules } from '@/features/patterns/patternApply';
import {
  applyTemplate,
  applyFuzzyColumnMapping,
  BUILT_IN_TEMPLATES,
  deleteCustomTemplate,
  getCustomTemplates,
  saveCustomTemplate,
  type AutoMapEntry,
  type SavedTemplate,
} from './templates';
import { NLRulesInput } from '@/features/nl-rules/NLRulesInput';

const MATCH_TYPE_OPTIONS: Array<{
  value: MatchingRule['matchType'];
  label: string;
  tooltip: string;
}> = [
  {
    value: 'exact',
    label: 'Exact',
    tooltip: 'Strings or numbers must be identical. Use for references, IDs, or codes that are exactly the same in both sources.',
  },
  {
    value: 'tolerance_numeric',
    label: 'Tolerance (numeric)',
    tooltip: 'Numbers within ±tolerance are considered a match. Use for amounts where small rounding differences are acceptable.',
  },
  {
    value: 'tolerance_date',
    label: 'Tolerance (date)',
    tooltip: 'Dates within ±N days are considered a match. Use when posting dates or transaction dates may differ slightly.',
  },
  {
    value: 'similar_text',
    label: 'Similar (text)',
    tooltip: 'Fuzzy string matching with a similarity threshold. Uses Levenshtein distance so minor typos or variations still match. Good for descriptions or references that may be slightly different.',
  },
  {
    value: 'contains',
    label: 'Contains',
    tooltip: 'One value contains the other. Use when one source has a short code (e.g. INV-001) and the other has a longer label (e.g. INV-001 Payment).',
  },
];

const MIN_IMPORTANCE_PCT = 5;

const MATCHING_TYPE_OPTIONS: Array<{
  value: MatchingType;
  title: string;
  description: string;
  visual: string;
}> = [
  {
    value: 'oneToOne',
    title: '1:1 (One-to-One)',
    description: 'Each transaction matches exactly one on the other side. Standard reconciliation.',
    visual: 'A₁ ↔ B₁   A₂ ↔ B₂   A₃ ↔ B₃',
  },
  {
    value: 'group',
    title: 'Group Matching (1:Many / Many:1)',
    description:
      'Allows multiple transactions on either side to match a single transaction on the other. The engine detects both directions automatically.',
    visual: 'A₁ + A₂ + A₃ → B₁   or   A₁ → B₁ + B₂ + B₃',
  },
];

interface NumericToleranceControlsProps {
  rule: MatchingRule;
  sourceA: ParsedCsv | null;
  sourceB: ParsedCsv | null;
  updateRule: (id: string, patch: Partial<MatchingRule>) => void;
}

function NumericToleranceControls({
  rule,
  sourceA,
  sourceB,
  updateRule,
}: NumericToleranceControlsProps) {
  const mode = rule.toleranceNumericMode ?? 'percentage';
  const maxFixed =
    sourceA?.rows && sourceB?.rows && rule.columnA && rule.columnB
      ? getMaxFixedTolerance(
          sourceA.rows,
          sourceB.rows,
          rule.columnA,
          rule.columnB
        )
      : 100;

  const handleModeChange = (m: ToleranceNumericMode) => {
    updateRule(rule.id, {
      toleranceNumericMode: m,
      toleranceValue: m === 'percentage' ? 0.005 : Math.min(25, maxFixed),
    });
  };

  return (
    <div className="grid gap-2 min-w-[200px]">
      <Label className="text-xs">Numeric tolerance</Label>
      <RadioGroup
        value={mode}
        onValueChange={(v) => handleModeChange(v as ToleranceNumericMode)}
        className="flex gap-4"
      >
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <RadioGroupItem value="fixed" />
          Fixed amount
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <RadioGroupItem value="percentage" />
          Percentage
        </label>
      </RadioGroup>
      {mode === 'percentage' ? (
        <div className="flex items-center gap-2">
          <Slider
            min={0}
            max={10}
            step={0.1}
            value={[((rule.toleranceValue ?? 0.005) * 100)]}
            onValueChange={(v) =>
              updateRule(rule.id, { toleranceValue: (v[0] ?? 0.5) / 100 })
            }
            className="flex-1"
          />
          <span className="text-sm font-medium tabular-nums w-12 shrink-0">
            {((rule.toleranceValue ?? 0.005) * 100).toFixed(1)}%
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Slider
            min={0}
            max={Math.max(maxFixed, 1)}
            step={1}
            value={[rule.toleranceValue ?? 0]}
            onValueChange={(v) =>
              updateRule(rule.id, { toleranceValue: v[0] ?? 0 })
            }
            className="flex-1"
          />
          <span className="text-sm font-medium tabular-nums w-16 shrink-0">
            ${(rule.toleranceValue ?? 0).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

export interface MatchingRulesPageProps {
  sourceA: ParsedCsv | null;
  sourceB: ParsedCsv | null;
  config: MatchingConfig;
  onConfigChange: (config: MatchingConfig) => void;
  previewResult: ReconciliationResult | null;
  isPreviewLoading: boolean;
  onDismissPreview: () => void;
  onConfirmPreview: () => void;
  organizationId?: string | null;
  className?: string;
}

function formatPreviewAmount(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getRuleMissingColumnWarning(
  rule: MatchingRule,
  headersA: string[],
  headersB: string[]
): { missingA: boolean; missingB: boolean; message: string } | null {
  const missingA = !!rule.columnA && !headersA.includes(rule.columnA);
  const missingB = !!rule.columnB && !headersB.includes(rule.columnB);
  if (!missingA && !missingB) return null;
  const parts: string[] = [];
  if (missingA) parts.push(`Column '${rule.columnA}' not found in Source A`);
  if (missingB) parts.push(`Column '${rule.columnB}' not found in Source B`);
  return {
    missingA,
    missingB,
    message: parts.join('. ') + '. Please update this rule.',
  };
}

function PreviewSummaryCard({
  result,
  onDismiss,
  onConfirm,
}: {
  result: ReconciliationResult;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const { matched, unmatchedA, unmatchedB } = result;
  const oneToOne = matched.filter(
    (m) => m.transactionsA.length === 1 && m.transactionsB.length === 1
  ).length;
  const groupMatches = matched.length - oneToOne;

  const totalRowsA =
    matched.reduce((s, m) => s + m.transactionsA.length, 0) + unmatchedA.length;
  const matchedRowsA = matched.reduce((s, m) => s + m.transactionsA.length, 0);
  const matchRatePct =
    totalRowsA > 0 ? (matchedRowsA / totalRowsA) * 100 : 0;

  const sumAmount = (txs: { amount: number }[]) =>
    txs.reduce((s, t) => s + t.amount, 0);
  const matchedAmountA = matched.reduce(
    (s, m) => s + sumAmount(m.transactionsA),
    0
  );
  const totalAmount =
    matchedAmountA + sumAmount(unmatchedA) + sumAmount(unmatchedB);
  const matchedAmountPct = totalAmount > 0 ? (matchedAmountA / totalAmount) * 100 : 0;

  const avgConfidencePct =
    matched.length > 0
      ? (matched.reduce((s, m) => s + m.confidence, 0) / matched.length) * 100
      : 0;

  return (
    <Card className="max-w-md bg-muted/50 border-muted relative">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Preview</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={onDismiss}
            aria-label="Dismiss preview"
          >
            <X className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">With these rules, we found:</p>
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            <span className="shrink-0">✅</span>
            <span>
              <strong>{matched.length}</strong> matched pair{matched.length !== 1 ? 's' : ''}{' '}
              ({oneToOne} at 1:1, {groupMatches} as group matches)
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="shrink-0">❌</span>
            <span>
              <strong>{unmatchedA.length}</strong> unmatched in Source A
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="shrink-0">❌</span>
            <span>
              <strong>{unmatchedB.length}</strong> unmatched in Source B
            </span>
          </li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant="secondary" className="font-normal">
            📊 Match rate: {matchRatePct.toFixed(1)}%
          </Badge>
          <Badge variant="secondary" className="font-normal">
            💰 Matched: ${formatPreviewAmount(matchedAmountA)} / ${formatPreviewAmount(totalAmount)} ({matchedAmountPct.toFixed(0)}%)
          </Badge>
          <Badge variant="secondary" className="font-normal">
            Average confidence: {avgConfidencePct.toFixed(1)}%
          </Badge>
        </div>
        <div className="pt-2">
          <Button onClick={onConfirm} className="w-full sm:w-auto">
            <Check className="size-4 mr-2" />
            Looks good, run matching →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MatchingRulesPage({
  sourceA,
  sourceB,
  config,
  onConfigChange,
  previewResult,
  isPreviewLoading,
  onDismissPreview,
  onConfirmPreview,
  organizationId,
  className,
}: MatchingRulesPageProps) {
  const headersA = sourceA?.headers ?? [];
  const headersB = sourceB?.headers ?? [];
  const [rulesInfluencedByLearning, setRulesInfluencedByLearning] = useState(false);

  useEffect(() => {
    if (
      config.rules.length === 0 &&
      sourceA &&
      sourceB &&
      sourceA.headers.length > 0 &&
      sourceB.headers.length > 0
    ) {
      const suggested = buildSuggestedRules(sourceA, sourceB);
      const baseRules =
        suggested.length > 0 ? suggested : getDefaultRules(headersA, headersB);

      if (organizationId) {
        enhanceSuggestedRules(
          organizationId,
          baseRules,
          sourceA.headers,
          sourceB.headers
        )
          .then(({ rules: enhancedRules, influenced }) => {
            setRulesInfluencedByLearning(influenced);
            onConfigChange({
              ...config,
              rules: enhancedRules.length > 0 ? enhancedRules : baseRules,
            });
          })
          .catch(() => {
            setRulesInfluencedByLearning(false);
            onConfigChange({ ...config, rules: baseRules });
          });
      } else {
        setRulesInfluencedByLearning(false);
        onConfigChange({ ...config, rules: baseRules });
      }
    }
  }, [
    config.rules.length,
    sourceA,
    sourceB,
    headersA.length,
    headersB.length,
    config,
    onConfigChange,
    organizationId,
  ]);

  const effectiveRules =
    config.rules.length > 0
      ? config.rules
      : sourceA && sourceB
        ? (() => {
            const suggested = buildSuggestedRules(sourceA, sourceB);
            return suggested.length > 0
              ? suggested
              : getDefaultRules(headersA, headersB);
          })()
        : getDefaultRules(headersA, headersB);

  const suggestedCount = effectiveRules.filter((r) => r.suggested).length;

  const n = effectiveRules.length;
  const totalWeightPercent = effectiveRules.reduce((s, r) => s + r.weight * 100, 0);
  /** Max % one rule can have so others stay >= MIN_IMPORTANCE_PCT each. */
  const maxImportancePct = n <= 1 ? 100 : Math.min(100, 100 - MIN_IMPORTANCE_PCT * (n - 1));

  const distributeEqually = () => {
    if (n === 0) return;
    setAutoMaps({});
    const w = 1 / n;
    onConfigChange({
      ...config,
      rules: effectiveRules.map((r) => ({ ...r, weight: w })),
    });
  };

  const setRuleImportance = (ruleId: string, pct: number) => {
    if (n <= 1) return;
    setAutoMaps({});
    const clamped = Math.min(maxImportancePct, Math.max(MIN_IMPORTANCE_PCT, pct)) / 100;
    const remaining = 1 - clamped;
    const otherCount = n - 1;
    const otherWeight = remaining / otherCount;
    const others = effectiveRules.filter((r) => r.id !== ruleId);
    const newWeights = new Map<string, number>();
    newWeights.set(ruleId, clamped);
    others.forEach((r, idx) => {
      const w = idx === others.length - 1 ? remaining - otherWeight * (otherCount - 1) : otherWeight;
      newWeights.set(r.id, w);
    });
    onConfigChange({
      ...config,
      rules: effectiveRules.map((r) => ({ ...r, weight: newWeights.get(r.id) ?? r.weight })),
    });
  };

  const addRule = () => {
    setAutoMaps({});
    const newRule: MatchingRule = {
      id: nextRuleId(),
      columnA: headersA[0] ?? '',
      columnB: headersB[0] ?? '',
      matchType: 'exact',
      weight: 0,
    };
    const nextRules = [...effectiveRules, newRule];
    const n = nextRules.length;
    const equalWeight = 1 / n;
    onConfigChange({
      ...config,
      rules: nextRules.map((r) => ({ ...r, weight: equalWeight })),
    });
  };

  const updateRule = (id: string, patch: Partial<MatchingRule>) => {
    if (autoMaps[id] && ('columnA' in patch || 'columnB' in patch)) {
      setAutoMaps((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
    onConfigChange({
      ...config,
      rules: effectiveRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const removeRule = (id: string) => {
    setAutoMaps({});
    const next = effectiveRules.filter((r) => r.id !== id);
    if (next.length === 0) return;
    const n = next.length;
    const equalWeight = 1 / n;
    onConfigChange({
      ...config,
      rules: next.map((r) => ({ ...r, weight: equalWeight })),
    });
  };

  // Template state
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [loadConfirmTemplate, setLoadConfirmTemplate] = useState<SavedTemplate | null>(null);
  const [customTemplates, setCustomTemplates] = useState<SavedTemplate[]>(() => getCustomTemplates());

  const refreshCustomTemplates = () => setCustomTemplates(getCustomTemplates());

  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    saveCustomTemplate({
      name,
      description: templateDescription.trim() || undefined,
      config: {
        rules: effectiveRules.map((r) => ({ ...r })),
        minConfidenceThreshold: config.minConfidenceThreshold,
        matchingType: config.matchingType,
      },
    });
    refreshCustomTemplates();
    setTemplateName('');
    setTemplateDescription('');
    setSaveTemplateOpen(false);
  };

  const [autoMaps, setAutoMaps] = useState<Record<string, AutoMapEntry>>({});
  const [showAutoMapBanner, setShowAutoMapBanner] = useState(false);

  const handleLoadTemplate = (template: SavedTemplate) => {
    setLoadConfirmTemplate(template);
  };

  const handleConfirmLoadTemplate = () => {
    if (!loadConfirmTemplate) return;
    const newConfig = applyTemplate(loadConfirmTemplate);
    const { config: mappedConfig, autoMaps: nextAutoMaps } = applyFuzzyColumnMapping(
      newConfig,
      headersA,
      headersB
    );
    onConfigChange(mappedConfig);
    setAutoMaps(nextAutoMaps);
    const autoMapCount = Object.values(nextAutoMaps).reduce(
      (s, e) => s + (e.columnA ? 1 : 0) + (e.columnB ? 1 : 0),
      0
    );
    setShowAutoMapBanner(autoMapCount > 0);
    setLoadConfirmTemplate(null);
  };

  const handleDeleteTemplate = (e: React.MouseEvent, template: SavedTemplate) => {
    e.preventDefault();
    e.stopPropagation();
    if (template.builtIn) return;
    deleteCustomTemplate(template.id);
    refreshCustomTemplates();
  };

  const allTemplates = [...BUILT_IN_TEMPLATES, ...customTemplates];

  const handleNLConfigGenerated = (newConfig: MatchingConfig, _explanation: string) => {
    onConfigChange(newConfig);
  };

  return (
    <div className={cn('space-y-8', className)}>
      {/* Matching type at top */}
      <Card>
        <CardHeader>
          <CardTitle>Reconciliation matching type</CardTitle>
          <CardDescription>
            Choose how transactions from Source A and Source B can be paired.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={config.matchingType}
            onValueChange={(value) => onConfigChange({ ...config, matchingType: value as MatchingType })}
            className="grid gap-4 sm:grid-cols-2"
          >
            {MATCHING_TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                htmlFor={`matching-type-${opt.value}`}
                className={cn(
                  'flex cursor-pointer flex-col gap-2 rounded-lg border-2 px-4 py-3 transition-colors',
                  config.matchingType === opt.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30'
                )}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} id={`matching-type-${opt.value}`} />
                  <span className="font-medium">{opt.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{opt.description}</p>
                <div className="mt-1 rounded bg-muted/50 px-2 py-1.5 font-mono text-xs">
                  {opt.visual}
                </div>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Matching rules */}
      <Card>
        <CardHeader>
          <CardTitle>Matching rules</CardTitle>
          <CardDescription>
            Add rules to compare columns between Source A and Source B. Set importance % per rule
            (must sum to 100%). At least one rule is required.
          </CardDescription>
          {suggestedCount > 0 && (
            <p className="text-sm text-muted-foreground pt-1">
              We detected {suggestedCount} potential matching rule{suggestedCount !== 1 ? 's' : ''} based on your column names. Review and adjust as needed.
            </p>
          )}
          {rulesInfluencedByLearning && (
            <p className="text-sm text-muted-foreground pt-1">
              Rules enhanced based on your previous reconciliations.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {showAutoMapBanner && (() => {
            const count = Object.values(autoMaps).reduce(
              (s, e) => s + (e.columnA ? 1 : 0) + (e.columnB ? 1 : 0),
              0
            );
            if (count === 0) return null;
            return (
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  Template loaded: {count} column{count !== 1 ? 's were' : ' was'} auto-mapped to match your files.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => setShowAutoMapBanner(false)}
                  aria-label="Dismiss"
                >
                  <X className="size-4" />
                </Button>
              </div>
            );
          })()}
          {effectiveRules.length === 0 && headersA.length > 0 && headersB.length > 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground text-sm mb-4">
                No matching rules yet. Add a rule to compare columns between the two sources.
              </p>
              <Button type="button" variant="outline" onClick={addRule}>
                <Plus className="size-4 mr-2" />
                Add matching rule
              </Button>
            </div>
          ) : (
            <>
          {effectiveRules.map((rule, index) => {
            const missingWarning = getRuleMissingColumnWarning(rule, headersA, headersB);
            return (
            <div
              key={rule.id}
              className={cn(
                'flex flex-wrap items-end gap-4 rounded-lg border p-4',
                missingWarning && 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800'
              )}
            >
              {missingWarning && (
                <p className="w-full text-sm text-yellow-800 dark:text-yellow-200 mb-1" role="alert">
                  {missingWarning.message}
                </p>
              )}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-medium text-muted-foreground">Rule {index + 1}</span>
                {rule.nlGenerated && (
                  <Badge variant="secondary" className="text-xs font-normal bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                    AI Generated
                  </Badge>
                )}
                {rule.suggested && !rule.nlGenerated && (
                  <Badge variant="secondary" className="text-xs font-normal bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Suggested
                  </Badge>
                )}
                {rule.learned && (
                  <Badge variant="secondary" className="text-xs font-normal bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                    Learned
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => removeRule(rule.id)}
                  disabled={effectiveRules.length <= 1}
                  aria-label="Remove rule"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="grid gap-2 min-w-[140px]">
                <Label className="text-xs">Source A column</Label>
                <Select
                  value={rule.columnA || undefined}
                  onValueChange={(v) => updateRule(rule.id, { columnA: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Column A" />
                  </SelectTrigger>
                  <SelectContent>
                    {headersA.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 min-w-[140px]">
                <Label className="text-xs">Source B column</Label>
                <Select
                  value={rule.columnB || undefined}
                  onValueChange={(v) => updateRule(rule.id, { columnB: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Column B" />
                  </SelectTrigger>
                  <SelectContent>
                    {headersB.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 min-w-[180px]">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Match type</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        aria-label="Match type help"
                      >
                        <Info className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[320px] space-y-1.5 text-xs">
                      {MATCH_TYPE_OPTIONS.map((opt) => (
                        <p key={opt.value}>
                          <span className="font-semibold">{opt.label}</span> — {opt.tooltip}
                        </p>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={rule.matchType}
                  onValueChange={(v) => {
                    const matchType = v as MatchingRule['matchType'];
                    updateRule(rule.id, {
                      matchType,
                      toleranceValue:
                        matchType === 'tolerance_numeric'
                          ? 0.005
                          : matchType === 'tolerance_date'
                            ? 3
                            : undefined,
                      toleranceNumericMode:
                        matchType === 'tolerance_numeric' ? 'percentage' : undefined,
                      similarityThreshold: matchType === 'similar_text' ? 0.8 : undefined,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATCH_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {rule.matchType === 'tolerance_numeric' && (
                <NumericToleranceControls
                  rule={rule}
                  sourceA={sourceA}
                  sourceB={sourceB}
                  updateRule={updateRule}
                />
              )}
              {rule.matchType === 'tolerance_date' && (
                <div className="grid gap-2 w-40">
                  <Label className="text-xs">Date tolerance</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      min={0}
                      max={30}
                      step={1}
                      value={[rule.toleranceValue ?? 3]}
                      onValueChange={(v) =>
                        updateRule(rule.id, { toleranceValue: v[0] ?? 3 })
                      }
                      className="flex-1"
                    />
                    <span className="text-sm font-medium tabular-nums w-16 shrink-0">
                      ±{rule.toleranceValue ?? 3} days
                    </span>
                  </div>
                </div>
              )}
              {rule.matchType === 'similar_text' && (
                <div className="grid gap-2 w-36">
                  <Label className="text-xs">Similarity threshold</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[Math.round((rule.similarityThreshold ?? 0.8) * 100)]}
                      onValueChange={(v) =>
                        updateRule(rule.id, { similarityThreshold: (v[0] ?? 80) / 100 })
                      }
                    />
                    <span className="text-sm font-medium tabular-nums w-10 shrink-0">
                      {Math.round((rule.similarityThreshold ?? 0.8) * 100)}%
                    </span>
                  </div>
                </div>
              )}
              <div className="grid gap-2 min-w-[140px] flex-1 max-w-[200px]">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Importance %</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        aria-label="Importance help"
                      >
                        <Info className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">
                      How much this rule contributes to the final confidence score. All rules must
                      sum to 100%.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <Slider
                    min={MIN_IMPORTANCE_PCT}
                    max={effectiveRules.length === 1 ? 100 : maxImportancePct}
                    step={1}
                    value={[Math.round(rule.weight * 100)]}
                    disabled={effectiveRules.length === 1}
                    onValueChange={(v) => setRuleImportance(rule.id, v[0] ?? MIN_IMPORTANCE_PCT)}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium tabular-nums w-9 shrink-0">
                    {Math.round(rule.weight * 100)}%
                  </span>
                </div>
              </div>
            </div>
          );
          })}
          <div className="flex flex-wrap items-center gap-4">
            <Button type="button" variant="outline" onClick={addRule}>
              <Plus className="size-4 mr-2" />
              Add matching rule
            </Button>
            {effectiveRules.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={distributeEqually}>
                Distribute equally
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSaveTemplateOpen(true)}
            >
              <Save className="size-4 mr-2" />
              Save as Template
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <ChevronDown className="size-4 mr-2" />
                  Load Template
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-w-sm">
                {allTemplates.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onSelect={() => handleLoadTemplate(t)}
                    className="flex flex-col items-stretch gap-1 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={t.builtIn ? 'secondary' : 'outline'} className="text-xs">
                          {t.builtIn ? 'Built-in' : 'Custom'}
                        </Badge>
                        <span className="font-medium">{t.name}</span>
                      </div>
                      {!t.builtIn && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => handleDeleteTemplate(e, t)}
                          aria-label="Delete template"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                    {t.description && (
                      <span className="text-xs text-muted-foreground">{t.description}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-4 pt-2 border-t">
            <span className="text-sm font-medium">
              Total: {totalWeightPercent.toFixed(1)}%
            </span>
          </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Natural Language Rules */}
      {sourceA && sourceB && (
        <NLRulesInput
          sourceA={sourceA}
          sourceB={sourceB}
          onConfigGenerated={handleNLConfigGenerated}
        />
      )}

      {/* Preview loading */}
      {isPreviewLoading && !previewResult && (
        <Card className="max-w-md bg-muted/30 border-muted">
          <CardContent className="flex items-center gap-3 py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">Calculating preview…</span>
          </CardContent>
        </Card>
      )}

      {/* Preview results card */}
      {previewResult && !isPreviewLoading && (
        <PreviewSummaryCard
          result={previewResult}
          onDismiss={onDismissPreview}
          onConfirm={onConfirmPreview}
        />
      )}

      {/* Save as Template dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Save your current matching rules, minimum confidence, and matching type so you can
              reuse them later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="template-name">Template name (required)</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. AP vs Bank Statement"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template-desc">Description (optional)</Label>
              <Input
                id="template-desc"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="e.g. Standard monthly reconciliation for accounts payable"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveTemplate}
              disabled={!templateName.trim()}
            >
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load template confirmation */}
      <Dialog
        open={!!loadConfirmTemplate}
        onOpenChange={(open) => !open && setLoadConfirmTemplate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load template</DialogTitle>
            <DialogDescription>
              This will replace your current rules. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLoadConfirmTemplate(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmLoadTemplate}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Min confidence */}
      <Card className="max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Minimum confidence</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  aria-label="Minimum confidence help"
                >
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[280px]">
                The confidence score (0–100%) indicates how certain the match is. Each matching rule
                contributes to the score based on its weight. Only pairs scoring above this threshold
                will be considered matched. Lower values find more matches but may include false
                positives. Higher values are stricter but more accurate.
              </TooltipContent>
            </Tooltip>
          </div>
          <CardDescription>
            Pairs must meet this score to count as matched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Slider
              min={0}
              max={100}
              step={1}
              value={[Math.round(config.minConfidenceThreshold * 100)]}
              onValueChange={(v) =>
                onConfigChange({
                  ...config,
                  minConfidenceThreshold: ((v[0] ?? 0) / 100),
                })
              }
            />
            <span className="text-sm font-medium tabular-nums w-10 shrink-0">
              {Math.round(config.minConfidenceThreshold * 100)}%
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
