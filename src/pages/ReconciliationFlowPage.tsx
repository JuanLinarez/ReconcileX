import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const [step, setStep] = useState<Step>('upload');
  const [uploadSlots, setUploadSlots] = useState<UploadSlot[]>(createInitialSlots);
  const [pairIndices, setPairIndices] = useState<[number, number]>([0, 1]);
  const [config, setConfig] = useState<MatchingConfig>(DEFAULT_MATCHING_CONFIG);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
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

  const handleRunMatching = () => {
    const r = run();
    if (r) {
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

  const handleConfirmPreview = () => {
    if (previewResult) {
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
          <ResultsPage result={result} />
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
