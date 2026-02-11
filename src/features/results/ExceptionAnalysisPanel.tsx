import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { AlertCircle, ChevronDown, Loader2, MessageSquare, RefreshCw, X } from 'lucide-react';
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
  followUpAnalysis?: ExceptionAnalysis | null;
  followUpLoading?: boolean;
  error?: string;
  sourceTransaction: Transaction;
  onAcceptMatch?: (candidate: Transaction) => void;
  /** Called when user dismisses. Pass rejectedCandidate if there was a suggested match the user declined. */
  onDismiss: (rejectedCandidate?: Transaction) => void;
  onRetry?: () => void;
  onReAnalyze?: () => void;
  onAskFollowUp?: (question: string) => void;
}

export function ExceptionAnalysisPanel({
  analysis,
  followUpAnalysis,
  followUpLoading = false,
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

  useEffect(() => {
    if (followUpAnalysis && !followUpLoading) {
      setFollowUpOpen(false);
      setFollowUpQuestion('');
    }
  }, [followUpAnalysis, followUpLoading]);

  const handleAccept = () => {
    if (suggestedMatch && onAcceptMatch) {
      onAcceptMatch(suggestedMatch.transaction);
    }
  };

  const handleFollowUpSubmit = () => {
    if (onAskFollowUp && followUpQuestion.trim()) {
      onAskFollowUp(followUpQuestion.trim());
      setFollowUpQuestion('');
    }
  };

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/30 min-w-0 overflow-visible">
      <Collapsible defaultOpen>
        <CardContent className="pt-4 pb-4 overflow-visible">
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
              onClick={() => onDismiss(suggestedMatch?.transaction)}
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </Button>
          </div>

          <CollapsibleContent className="data-[state=open]:overflow-visible">
            <div className="space-y-4 min-w-0 [word-break:break-word] [overflow-wrap:break-word]">
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
                    <p className="text-sm break-words">{probableCause}</p>
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
                    <p className="text-muted-foreground break-words">{suggestedMatch.reason}</p>
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
                    <p className="text-sm break-words">{recommendedAction}</p>
                  </section>

                  {(followUpLoading || followUpAnalysis) && (
                    <section className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/20 p-3 mt-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-200 mb-2">
                        Follow-up Response
                      </h4>
                      {followUpLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin shrink-0" />
                          <span>Getting response from Claude...</span>
                        </div>
                      ) : followUpAnalysis ? (
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-0.5">Probable cause</p>
                            <p className="text-sm break-words">{followUpAnalysis.probableCause}</p>
                          </div>
                          {followUpAnalysis.suggestedMatch && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-0.5">Suggested match</p>
                              <p className="text-sm break-words">{followUpAnalysis.suggestedMatch.reason}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-0.5">Recommended action</p>
                            <p className="text-sm break-words">{followUpAnalysis.recommendedAction}</p>
                          </div>
                        </div>
                      ) : null}
                    </section>
                  )}
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
                <Button type="button" variant="outline" size="sm" onClick={() => onDismiss(suggestedMatch?.transaction)}>
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
                          onKeyDown={(e) => e.key === 'Enter' && !followUpLoading && handleFollowUpSubmit()}
                          className="w-64 h-8 text-sm min-w-0"
                          disabled={followUpLoading}
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleFollowUpSubmit}
                          disabled={followUpLoading}
                        >
                          {followUpLoading ? (
                            <>
                              <Loader2 className="size-3.5 mr-1 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            'Send'
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFollowUpOpen(false);
                            setFollowUpQuestion('');
                          }}
                          disabled={followUpLoading}
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
