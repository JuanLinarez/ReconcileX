import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { AlertCircle, ChevronDown, MessageSquare, RefreshCw, X } from 'lucide-react';
import type { ExceptionAnalysis, ConfidenceLevel } from './exceptionAnalysis';
import type { Transaction } from '@/features/reconciliation/types';

function formatDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function formatAmount(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function confidenceColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'High':
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    case 'Medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
    case 'Low':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
    default:
      return '';
  }
}

export interface ExceptionAnalysisPanelProps {
  analysis: ExceptionAnalysis | null;
  error?: string;
  sourceTransaction: Transaction;
  onAcceptMatch?: (candidate: Transaction) => void;
  onDismiss: () => void;
  onRetry?: () => void;
  onReAnalyze?: () => void;
  onAskFollowUp?: (question: string) => void;
}

export function ExceptionAnalysisPanel({
  analysis,
  error,
  sourceTransaction: _sourceTransaction,
  onAcceptMatch,
  onDismiss,
  onRetry,
  onReAnalyze,
  onAskFollowUp,
}: ExceptionAnalysisPanelProps) {
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const probableCause = analysis?.probableCause ?? '';
  const suggestedMatch = analysis?.suggestedMatch;
  const recommendedAction = analysis?.recommendedAction ?? '';

  const handleAccept = () => {
    if (suggestedMatch && onAcceptMatch) {
      onAcceptMatch(suggestedMatch.transaction);
    }
  };

  const handleFollowUpSubmit = () => {
    if (onAskFollowUp && followUpQuestion.trim()) {
      onAskFollowUp(followUpQuestion.trim());
      setFollowUpQuestion('');
      setFollowUpOpen(false);
    }
  };

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/30">
      <Collapsible defaultOpen>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-blue-800 dark:text-blue-200">
                <ChevronDown className="size-4" />
                AI Exception Analysis
              </Button>
            </CollapsibleTrigger>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={onDismiss}
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </Button>
          </div>

          <CollapsibleContent>
            <div className="space-y-4">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-3 flex items-start gap-2">
                  <AlertCircle className="size-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      {error.includes('connect') || error.includes('connection')
                        ? 'Could not connect to AI service. Check your connection.'
                        : 'AI analysis failed. Please try again.'}
                    </p>
                    {onRetry && (
                      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
                        <RefreshCw className="size-3.5 mr-1" /> Retry
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {analysis && (
                <>
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Probable cause
                    </h4>
                    <p className="text-sm">{probableCause}</p>
                  </section>

                  {suggestedMatch && (
                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Suggested match
                      </h4>
                  <div className="rounded-md border bg-background/60 p-3 text-sm space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Row {suggestedMatch.transaction.rowIndex}</span>
                      <span>{formatAmount(suggestedMatch.transaction.amount)}</span>
                      <span>{formatDate(suggestedMatch.transaction.date)}</span>
                      <span className="max-w-[200px] truncate" title={suggestedMatch.transaction.reference}>
                        {suggestedMatch.transaction.reference}
                      </span>
                      <Badge variant="secondary" className={confidenceColor(suggestedMatch.confidence)}>
                        {suggestedMatch.confidence}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{suggestedMatch.reason}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {suggestedMatch.amountDiff != null && (
                        <span>Amount diff: {suggestedMatch.amountDiff >= 0 ? '+' : ''}{formatAmount(suggestedMatch.amountDiff)}</span>
                      )}
                      {suggestedMatch.dateDiffDays != null && (
                        <span>Date diff: {suggestedMatch.dateDiffDays >= 0 ? '+' : ''}{suggestedMatch.dateDiffDays} days</span>
                      )}
                      {suggestedMatch.nameSimilarityPct != null && (
                        <span>Name similarity: {suggestedMatch.nameSimilarityPct}%</span>
                      )}
                    </div>
                  </div>
                </section>
                  )}

                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Recommended action
                    </h4>
                    <p className="text-sm">{recommendedAction}</p>
                  </section>
                </>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                {suggestedMatch && onAcceptMatch && (
                  <Button type="button" size="sm" onClick={handleAccept}>
                    <span className="mr-1">✓</span> Accept Match
                  </Button>
                )}
                {onReAnalyze && analysis && (
                  <Button type="button" variant="outline" size="sm" onClick={onReAnalyze}>
                    <RefreshCw className="size-3.5 mr-1" /> Re-analyze
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
                  <X className="size-3.5 mr-1" /> Dismiss
                </Button>
                {onAskFollowUp && analysis && (
                  <>
                    {!followUpOpen ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFollowUpOpen(true)}
                      >
                        <MessageSquare className="size-3.5 mr-1" /> Ask Follow-up
                      </Button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          placeholder="Ask about this exception..."
                          value={followUpQuestion}
                          onChange={(e) => setFollowUpQuestion(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleFollowUpSubmit()}
                          className="w-64 h-8 text-sm"
                        />
                        <Button type="button" size="sm" onClick={handleFollowUpSubmit}>
                          Send
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFollowUpOpen(false);
                            setFollowUpQuestion('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
