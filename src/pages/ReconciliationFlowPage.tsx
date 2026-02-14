import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { saveReconciliation } from '@/lib/database';
import { captureRuleConfiguration } from '@/features/patterns/patternCapture';
import { Button } from '@/components/ui/button';
import { UploadPage } from '@/features/upload/UploadPage';
import { PreviewPage } from '@/features/preview/PreviewPage';
import { MatchingRulesPage } from '@/features/matching-rules/MatchingRulesPage';
import { ResultsPage } from '@/features/results/ResultsPage';
import { useMatching } from '@/features/reconciliation/hooks/useMatching';
import { runServerMatching } from '@/features/reconciliation/services/serverMatching';
import { getDefaultRules } from '@/features/matching-rules/defaultRules';
import type {
  ReconciliationResult,
  MatchingConfig,
  MatchingRule,
  UploadSlot,
} from '@/features/reconciliation/types';
import type { ParsedCsv } from '@/features/reconciliation/types';
import { withSource } from '@/features/reconciliation/utils/parseCsv';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import { scanDataQuality, applyAutoFix } from '@/features/normalization/dataQualityScanner';

type Step = 'upload' | 'normalize' | 'preview' | 'matchingRules' | 'results';

const SERVER_MATCHING_THRESHOLD = 1500;

function weightsSumTo100(rules: MatchingRule[]): boolean {
  if (rules.length === 0) return false;
  const sum = rules.reduce((s, r) => s + r.weight, 0);
  return Math.abs(sum - 1) < 0.001;
}

const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  rules: [],
  minConfidenceThreshold: 0.7,
  matchingType: 'oneToOne',
};

function createInitialSlots(): UploadSlot[] {
  return [
    { id: `slot-${Date.now()}-a`, label: 'Source A', parsed: null },
    { id: `slot-${Date.now()}-b`, label: 'Source B', parsed: null },
  ];
}

export function ReconciliationFlowPage() {
  const { organizationId } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [uploadSlots, setUploadSlots] = useState<UploadSlot[]>(createInitialSlots);
  const [pairIndices, setPairIndices] = useState<[number, number]>([0, 1]);
  const [config, setConfig] = useState<MatchingConfig>(DEFAULT_MATCHING_CONFIG);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [currentReconciliationId, setCurrentReconciliationId] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<ReconciliationResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchingProgress, setMatchingProgress] = useState<string>('');
  const [normalizedA, setNormalizedA] = useState<ParsedCsv | null>(null);
  const [normalizedB, setNormalizedB] = useState<ParsedCsv | null>(null);
  const [showDataPreview, setShowDataPreview] = useState(false);

  const sourceA = useMemo(() => {
    const slot = uploadSlots[pairIndices[0]];
    const p = slot?.parsed;
    return p ? withSource(p, 'sourceA') : null;
  }, [uploadSlots, pairIndices]);
  const sourceB = useMemo(() => {
    const slot = uploadSlots[pairIndices[1]];
    const p = slot?.parsed;
    return p ? withSource(p, 'sourceB') : null;
  }, [uploadSlots, pairIndices]);

  const effectiveSourceA = normalizedA ?? sourceA;
  const effectiveSourceB = normalizedB ?? sourceB;

  const effectiveConfig = useMemo((): MatchingConfig => {
    if (config.rules.length > 0) return config;
    const headersA = effectiveSourceA?.headers ?? [];
    const headersB = effectiveSourceB?.headers ?? [];
    const defaultRules = getDefaultRules(headersA, headersB);
    return { ...config, rules: defaultRules };
  }, [config, effectiveSourceA?.headers, effectiveSourceB?.headers]);

  const shouldUseServerMatching = useMemo(() => {
    const totalRows = (effectiveSourceA?.rows.length ?? 0) + (effectiveSourceB?.rows.length ?? 0);
    return totalRows >= SERVER_MATCHING_THRESHOLD;
  }, [effectiveSourceA, effectiveSourceB]);

  const { run } = useMatching({
    sourceA: effectiveSourceA,
    sourceB: effectiveSourceB,
    config: effectiveConfig,
  });

  const canProceedFromUpload =
    sourceA != null && sourceB != null && pairIndices[0] !== pairIndices[1];

  const canRunMatching =
    effectiveSourceA?.rows.length &&
    effectiveSourceB?.rows.length &&
    effectiveConfig.rules.length >= 1 &&
    weightsSumTo100(effectiveConfig.rules);

  const persistReconciliation = useCallback(
    async (r: ReconciliationResult): Promise<string | null> => {
      if (!organizationId || !effectiveSourceA || !effectiveSourceB) return null;
      const slotA = uploadSlots[pairIndices[0]];
      const slotB = uploadSlots[pairIndices[1]];
      const sourceAName = effectiveSourceA.filename ?? slotA?.label ?? 'Source A';
      const sourceBName = effectiveSourceB.filename ?? slotB?.label ?? 'Source B';
      const sourceARows = effectiveSourceA.rows.length;
      const sourceBRows = effectiveSourceB.rows.length;
      const matchedCount = r.matched.length;
      const totalRows = sourceARows + sourceBRows;
      const matchRatePct = totalRows > 0 ? (matchedCount * 2 / totalRows) * 100 : 0;
      const matchedAmount = r.matched.reduce((sum, m) => {
        const amounts = [...m.transactionsA, ...m.transactionsB].map((t) => t.amount);
        return sum + amounts.reduce((a, b) => a + b, 0) / Math.max(amounts.length, 1);
      }, 0);
      const id = await saveReconciliation({
        organization_id: organizationId,
        source_a_name: sourceAName,
        source_b_name: sourceBName,
        source_a_rows: sourceARows,
        source_b_rows: sourceBRows,
        matched_count: matchedCount,
        unmatched_a_count: r.unmatchedA.length,
        unmatched_b_count: r.unmatchedB.length,
        match_rate: Math.min(100, matchRatePct),
        matched_amount: matchedAmount,
        matching_type: r.config.matchingType === 'oneToOne' ? '1:1' : 'group',
        rules_config: r.config,
        results_summary: {
          matched_count: matchedCount,
          unmatched_a_count: r.unmatchedA.length,
          unmatched_b_count: r.unmatchedB.length,
          match_rate_pct: Math.min(100, matchRatePct),
        },
      });
      return id;
    },
    [organizationId, effectiveSourceA, effectiveSourceB, uploadSlots, pairIndices]
  );

  const handleRunMatching = async () => {
    if (!canRunMatching || !effectiveSourceA || !effectiveSourceB) return;
    setIsMatching(true);
    setMatchingProgress('');

    try {
      let r: ReconciliationResult;

      if (shouldUseServerMatching) {
        const totalRows = effectiveSourceA.rows.length + effectiveSourceB.rows.length;
        setMatchingProgress(`Processing ${totalRows.toLocaleString()} records on server...`);
        r = await runServerMatching({ sourceA: effectiveSourceA, sourceB: effectiveSourceB, config: effectiveConfig, organizationId: organizationId ?? undefined });
      } else {
        setMatchingProgress('Processing...');
        const result = run();
        if (!result) {
          setIsMatching(false);
          return;
        }
        r = result;
      }

      const id = await persistReconciliation(r);
      setCurrentReconciliationId(id);
      setResult(r);
      setStep('results');
      if (organizationId) {
        captureRuleConfiguration(organizationId, r.config.rules);
      }
    } catch (error) {
      console.error('Matching failed:', error);
      setMatchingProgress(getFriendlyErrorMessage(error));
      setTimeout(() => {
        setIsMatching(false);
        setMatchingProgress('');
      }, 5000);
      return;
    }
    setIsMatching(false);
    setMatchingProgress('');
  };

  const handlePreview = async () => {
    if (!canRunMatching || !effectiveSourceA || !effectiveSourceB) return;
    setIsPreviewLoading(true);
    setPreviewResult(null);
    setMatchingProgress('');

    let hadError = false;
    try {
      if (shouldUseServerMatching) {
        const totalRows = effectiveSourceA.rows.length + effectiveSourceB.rows.length;
        setMatchingProgress(`Previewing ${totalRows.toLocaleString()} records on server...`);
        const r = await runServerMatching({ sourceA: effectiveSourceA, sourceB: effectiveSourceB, config: effectiveConfig, organizationId: organizationId ?? undefined });
        setPreviewResult(r);
      } else {
        const r = run();
        setPreviewResult(r ?? null);
      }
    } catch (error) {
      hadError = true;
      console.error('Preview failed:', error);
      setMatchingProgress(getFriendlyErrorMessage(error));
    } finally {
      setIsPreviewLoading(false);
      if (!hadError) setMatchingProgress('');
    }
  };

  const handleConfirmPreview = async () => {
    if (previewResult) {
      const id = await persistReconciliation(previewResult);
      setCurrentReconciliationId(id);
      setResult(previewResult);
      setPreviewResult(null);
      setStep('results');
      if (organizationId) {
        captureRuleConfiguration(organizationId, previewResult.config.rules);
      }
    }
  };

  useEffect(() => {
    setPreviewResult(null);
  }, [config]);

  useEffect(() => {
    if (step === 'upload') {
      setNormalizedA(null);
      setNormalizedB(null);
      setShowDataPreview(false);
    }
  }, [step]);

  // Auto-normalize when step is 'normalize': scan, apply safe fixes, advance to matchingRules
  useEffect(() => {
    if (step !== 'normalize' || !sourceA || !sourceB) return;

    const MIN_DELAY_MS = 1500;
    const start = Date.now();

    const run = (): void => {
      try {
        const scanResult = scanDataQuality(sourceA, sourceB);
        const autoFixableA = scanResult.sourceA.filter((i) => i.autoFixable);
        const autoFixableB = scanResult.sourceB.filter((i) => i.autoFixable);
        const outA = applyAutoFix(sourceA, autoFixableA);
        const outB = applyAutoFix(sourceB, autoFixableB);
        setNormalizedA(outA);
        setNormalizedB(outB);
      } catch {
        setNormalizedA(null);
        setNormalizedB(null);
      }

      const elapsed = Date.now() - start;
      const remaining = Math.max(0, MIN_DELAY_MS - elapsed);
      setTimeout(() => setStep('matchingRules'), remaining);
    };

    run();
  }, [step, sourceA, sourceB]);

  const steps: { id: Step; label: string; number: number }[] = [
    { id: 'upload', label: 'Upload', number: 1 },
    { id: 'matchingRules', label: 'Matching Rules', number: 2 },
    { id: 'results', label: 'Results', number: 3 },
  ];
  const currentVisualIndex = (() => {
    if (step === 'upload') return 0;
    if (step === 'normalize' || step === 'preview') return 0;
    if (step === 'matchingRules') return 1;
    if (step === 'results') return 2;
    return 0;
  })();

  return (
    <div className="space-y-8">
      {/* Visual stepper (Finalytic style) */}
      <nav className="w-full py-4" aria-label="Reconciliation steps">
        <div className="flex items-start justify-between gap-4">
          {steps.map(({ id, label, number }, index) => {
            const isCompleted = index < currentVisualIndex;
            const isCurrent = index === currentVisualIndex;
            const isUpcoming = index > currentVisualIndex;
            const isLast = index === steps.length - 1;
            return (
              <div key={id} className="flex flex-1 flex-col items-center min-w-0">
                <div className="flex w-full items-center">
                  {index > 0 && (
                    <div
                      className={cn(
                        'h-0.5 flex-1 transition-colors',
                        index <= currentVisualIndex ? 'bg-[#1E3A5F]' : 'bg-gray-200'
                      )}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setStep(id)}
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
                      isCompleted && 'bg-[#1E3A5F] text-white',
                      isCurrent && 'bg-[#1E3A5F] text-white',
                      isUpcoming && 'border-2 border-gray-300 bg-white text-gray-400'
                    )}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : number}
                  </button>
                  {!isLast && (
                    <div
                      className={cn(
                        'h-0.5 flex-1 transition-colors',
                        index < currentVisualIndex ? 'bg-[#1E3A5F]' : 'bg-gray-200'
                      )}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setStep(id)}
                  className={cn(
                    'mt-3 text-center text-sm font-medium transition-colors font-heading',
                    isCurrent && 'text-[#1E3A5F] font-bold',
                    !isCurrent && 'text-[var(--app-body)] hover:text-[var(--app-heading)]'
                  )}
                >
                  {label}
                </button>
              </div>
            );
          })}
        </div>
      </nav>

      {step === 'upload' && (
        <>
          <UploadPage
            slots={uploadSlots}
            onSlotsChange={setUploadSlots}
            pairIndices={pairIndices}
            onPairChange={setPairIndices}
          />
          {canProceedFromUpload && (
            <div className="flex justify-center">
              <Button variant="dark" onClick={() => setStep('normalize')}>Continue</Button>
            </div>
          )}
        </>
      )}

      {step === 'normalize' && sourceA && sourceB && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-600 border-t-transparent" />
          <div className="text-center">
            <p className="text-base font-semibold text-[var(--app-heading)]">Preparing your data...</p>
            <p className="mt-1 text-sm text-[var(--app-body)]">Scanning and optimizing for best matching results</p>
          </div>
        </div>
      )}

      {step === 'matchingRules' && (
        <>
          {/* Collapsible Data Preview */}
          <div className="rounded-lg border border-[var(--app-border)] bg-white">
            <button
              type="button"
              onClick={() => setShowDataPreview(!showDataPreview)}
              className="flex w-full items-center justify-between p-4 text-left cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
                  <Eye className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-sm font-medium text-[var(--app-heading)]">
                    Review Your Uploaded Files
                  </span>
                  <p className="text-xs text-[var(--app-body)]/60">
                    {effectiveSourceA?.filename ?? 'Source A'} ({effectiveSourceA?.rows.length ?? 0} rows) &bull; {effectiveSourceB?.filename ?? 'Source B'} ({effectiveSourceB?.rows.length ?? 0} rows)
                  </p>
                </div>
              </div>
              {showDataPreview ? (
                <ChevronDown className="h-4 w-4 text-[var(--app-body)]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[var(--app-body)]" />
              )}
            </button>
            {showDataPreview && (
              <div className="border-t border-[var(--app-border)] p-4">
                <PreviewPage sourceA={effectiveSourceA} sourceB={effectiveSourceB} />
              </div>
            )}
          </div>

          <MatchingRulesPage
            sourceA={effectiveSourceA}
            sourceB={effectiveSourceB}
            config={config}
            onConfigChange={setConfig}
            previewResult={previewResult}
            isPreviewLoading={isPreviewLoading}
            onDismissPreview={() => setPreviewResult(null)}
            onConfirmPreview={handleConfirmPreview}
            organizationId={organizationId}
          />

          {(isMatching || matchingProgress) && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-blue-200 bg-blue-50 p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-600 border-t-transparent" />
              <div className="text-center">
                <p className="text-base font-semibold text-gray-900">
                  {matchingProgress || 'Processing...'}
                </p>
                {shouldUseServerMatching && effectiveSourceA && effectiveSourceB && (
                  <p className="mt-2 text-sm text-gray-500">
                    {(() => {
                      const total = (effectiveSourceA.rows.length ?? 0) + (effectiveSourceB.rows.length ?? 0);
                      let estimate = '';
                      if (total <= 5000) estimate = 'less than 30 seconds';
                      else if (total <= 10000) estimate = 'approximately 30 seconds';
                      else if (total <= 25000) estimate = 'approximately 1-2 minutes';
                      else if (total <= 50000) estimate = 'approximately 2-3 minutes';
                      else estimate = 'approximately 3-5 minutes';
                      return `Large dataset — estimated time: ${estimate}. Please do not close this tab.`;
                    })()}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <Button variant="outline" onClick={() => setStep('upload')}>
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={!canRunMatching || isPreviewLoading || isMatching}
                onClick={handlePreview}
              >
                {isPreviewLoading ? 'Calculating…' : 'Preview Results'}
              </Button>
              <Button variant="dark" disabled={!canRunMatching || isMatching} onClick={handleRunMatching}>
                {isMatching ? 'Processing…' : 'Run Matching'}
              </Button>
            </div>
          </div>
        </>
      )}

      {step === 'results' && result && (
        <>
          {(isMatching || matchingProgress) && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-blue-200 bg-blue-50 p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-600 border-t-transparent" />
              <div className="text-center">
                <p className="text-base font-semibold text-gray-900">
                  {matchingProgress || 'Processing...'}
                </p>
                {shouldUseServerMatching && effectiveSourceA && effectiveSourceB && (
                  <p className="mt-2 text-sm text-gray-500">
                    {(() => {
                      const total = (effectiveSourceA.rows.length ?? 0) + (effectiveSourceB.rows.length ?? 0);
                      let estimate = '';
                      if (total <= 5000) estimate = 'less than 30 seconds';
                      else if (total <= 10000) estimate = 'approximately 30 seconds';
                      else if (total <= 25000) estimate = 'approximately 1-2 minutes';
                      else if (total <= 50000) estimate = 'approximately 2-3 minutes';
                      else estimate = 'approximately 3-5 minutes';
                      return `Large dataset — estimated time: ${estimate}. Please do not close this tab.`;
                    })()}
                  </p>
                )}
              </div>
            </div>
          )}

          <ResultsPage
            result={result}
            reconciliationId={currentReconciliationId}
            organizationId={organizationId}
            sourceAName={
              effectiveSourceA?.filename ??
              uploadSlots[pairIndices[0]]?.label ??
              'Source A'
            }
            sourceBName={
              effectiveSourceB?.filename ??
              uploadSlots[pairIndices[1]]?.label ??
              'Source B'
            }
          />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('matchingRules')}>
              Back to Matching Rules
            </Button>
            <Button variant="dark" onClick={handleRunMatching} disabled={isMatching}>
              {isMatching ? 'Processing…' : 'Run again'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
