import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { saveReconciliation } from '@/lib/database';
import { Button } from '@/components/ui/button';
import { UploadPage } from '@/features/upload/UploadPage';
import { PreviewPage } from '@/features/preview/PreviewPage';
import { MatchingRulesPage } from '@/features/matching-rules/MatchingRulesPage';
import { ResultsPage } from '@/features/results/ResultsPage';
import { useMatching } from '@/features/reconciliation/hooks/useMatching';
import { getDefaultRules } from '@/features/matching-rules/defaultRules';
import type {
  ReconciliationResult,
  MatchingConfig,
  MatchingRule,
  UploadSlot,
} from '@/features/reconciliation/types';
import { withSource } from '@/features/reconciliation/utils/parseCsv';

type Step = 'upload' | 'preview' | 'matchingRules' | 'results';

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

  const effectiveConfig = useMemo((): MatchingConfig => {
    if (config.rules.length > 0) return config;
    const headersA = sourceA?.headers ?? [];
    const headersB = sourceB?.headers ?? [];
    const defaultRules = getDefaultRules(headersA, headersB);
    return { ...config, rules: defaultRules };
  }, [config, sourceA?.headers, sourceB?.headers]);

  const { run } = useMatching({
    sourceA,
    sourceB,
    config: effectiveConfig,
  });

  const canProceedFromUpload =
    sourceA != null && sourceB != null && pairIndices[0] !== pairIndices[1];

  const canRunMatching =
    sourceA?.rows.length &&
    sourceB?.rows.length &&
    effectiveConfig.rules.length >= 1 &&
    weightsSumTo100(effectiveConfig.rules);

  const persistReconciliation = useCallback(
    async (r: ReconciliationResult): Promise<string | null> => {
      if (!organizationId || !sourceA || !sourceB) return null;
      const slotA = uploadSlots[pairIndices[0]];
      const slotB = uploadSlots[pairIndices[1]];
      const sourceAName = sourceA.filename ?? slotA?.label ?? 'Source A';
      const sourceBName = sourceB.filename ?? slotB?.label ?? 'Source B';
      const sourceARows = sourceA.rows.length;
      const sourceBRows = sourceB.rows.length;
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
    [organizationId, sourceA, sourceB, uploadSlots, pairIndices]
  );

  const handleRunMatching = async () => {
    const r = run();
    if (r) {
      const id = await persistReconciliation(r);
      setCurrentReconciliationId(id);
      setResult(r);
      setStep('results');
    }
  };

  const handlePreview = () => {
    if (!canRunMatching) return;
    setIsPreviewLoading(true);
    setPreviewResult(null);
    setTimeout(() => {
      const r = run();
      setPreviewResult(r ?? null);
      setIsPreviewLoading(false);
    }, 0);
  };

  const handleConfirmPreview = async () => {
    if (previewResult) {
      const id = await persistReconciliation(previewResult);
      setCurrentReconciliationId(id);
      setResult(previewResult);
      setPreviewResult(null);
      setStep('results');
    }
  };

  useEffect(() => {
    setPreviewResult(null);
  }, [config]);

  const steps: { id: Step; label: string; number: number }[] = [
    { id: 'upload', label: 'Upload', number: 1 },
    { id: 'preview', label: 'Preview', number: 2 },
    { id: 'matchingRules', label: 'Matching Rules', number: 3 },
    { id: 'results', label: 'Results', number: 4 },
  ];
  const stepOrder: Step[] = ['upload', 'preview', 'matchingRules', 'results'];
  const currentStepIndex = stepOrder.indexOf(step);

  return (
    <div className="space-y-8">
      {/* Visual stepper */}
      <nav className="w-full" aria-label="Reconciliation steps">
        <div className="flex items-start justify-between">
          {steps.map(({ id, label, number }, index) => {
            const isCompleted = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const isUpcoming = index > currentStepIndex;
            const isLast = index === steps.length - 1;
            return (
              <div key={id} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  {index > 0 && (
                    <div
                      className={cn(
                        'h-0.5 flex-1 transition-colors',
                        index <= currentStepIndex ? 'bg-[#2563EB]' : 'bg-[var(--app-border)]'
                      )}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setStep(id)}
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
                      isCompleted && 'bg-[#2563EB] text-white',
                      isCurrent && 'bg-[#2563EB] text-white',
                      isUpcoming && 'border-2 border-[var(--app-border)] bg-white text-[var(--app-body)]'
                    )}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : number}
                  </button>
                  {!isLast && (
                    <div
                      className={cn(
                        'h-0.5 flex-1 transition-colors',
                        index < currentStepIndex ? 'bg-[#2563EB]' : 'bg-[var(--app-border)]'
                      )}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setStep(id)}
                  className={cn(
                    'mt-2 text-center text-xs font-medium transition-colors sm:text-sm',
                    isCurrent ? 'text-[var(--app-primary)]' : 'text-[var(--app-body)] hover:text-[var(--app-heading)]'
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
              <Button onClick={() => setStep('preview')}>Continue to Preview</Button>
            </div>
          )}
        </>
      )}

      {step === 'preview' && (
        <>
          <PreviewPage sourceA={sourceA} sourceB={sourceB} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button onClick={() => setStep('matchingRules')}>
              Continue to Matching Rules
            </Button>
          </div>
        </>
      )}

      {step === 'matchingRules' && (
        <>
          <MatchingRulesPage
            sourceA={sourceA}
            sourceB={sourceB}
            config={config}
            onConfigChange={setConfig}
            previewResult={previewResult}
            isPreviewLoading={isPreviewLoading}
            onDismissPreview={() => setPreviewResult(null)}
            onConfirmPreview={handleConfirmPreview}
          />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Button variant="outline" onClick={() => setStep('preview')}>
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={!canRunMatching || isPreviewLoading}
                onClick={handlePreview}
              >
                {isPreviewLoading ? 'Calculating…' : 'Preview Results'}
              </Button>
              <Button disabled={!canRunMatching} onClick={handleRunMatching}>
                Run Matching
              </Button>
            </div>
          </div>
        </>
      )}

      {step === 'results' && result && (
        <>
          <ResultsPage result={result} reconciliationId={currentReconciliationId} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('matchingRules')}>
              Back to Matching Rules
            </Button>
            <Button onClick={handleRunMatching}>Run again</Button>
          </div>
        </>
      )}
    </div>
  );
}
