import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { UploadPage } from '@/features/upload/UploadPage';
import { PreviewPage } from '@/features/preview/PreviewPage';
import { MatchingRulesPage } from '@/features/matching-rules/MatchingRulesPage';
import { ResultsPage } from '@/features/results/ResultsPage';
import { useMatching } from '@/features/reconciliation/hooks/useMatching';
import { getDefaultRules } from '@/features/matching-rules/defaultRules';
import type {
  ParsedCsv,
  ReconciliationResult,
  MatchingConfig,
  MatchingRule,
} from '@/features/reconciliation/types';

type Step = 'upload' | 'preview' | 'matchingRules' | 'results';

/** Weights are stored as 0-1 and must sum to 1 for valid config. */
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

function App() {
  const [step, setStep] = useState<Step>('upload');
  const [sourceA, setSourceA] = useState<ParsedCsv | null>(null);
  const [sourceB, setSourceB] = useState<ParsedCsv | null>(null);
  const [config, setConfig] = useState<MatchingConfig>(DEFAULT_MATCHING_CONFIG);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [previewResult, setPreviewResult] = useState<ReconciliationResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

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

  const handleParsed = (a: ParsedCsv | null, b: ParsedCsv | null) => {
    setSourceA(a);
    setSourceB(b);
    if (a && b) setStep('preview');
  };

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

  // Clear preview when rules or config change (preview is stale)
  useEffect(() => {
    setPreviewResult(null);
  }, [config]);

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          {(
            [
              ['upload', '1. Upload'],
              ['preview', '2. Preview'],
              ['matchingRules', '3. Matching Rules'],
              ['results', '4. Results'],
            ] as const
          ).map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(s)}
              className={
                step === s
                  ? 'font-medium text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }
            >
              {label}
            </button>
          ))}
        </nav>

        {step === 'upload' && (
          <>
            <UploadPage onParsed={handleParsed} sourceA={sourceA} sourceB={sourceB} />
            {sourceA && sourceB && (
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
            <div className="flex justify-between items-center gap-4 flex-wrap">
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
    </div>
  );
}

export default App;
