import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSectionHeader,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronDown, ChevronRight, Check, Download, Eye, EyeOff, Info, Link2, Loader2, MinusCircle, Sparkles } from 'lucide-react';
import type {
  MatchResult,
  ReconciliationResult,
  Transaction,
} from '@/features/reconciliation/types';
import {
  createInitialAugmentation,
  getDisplayedUnmatched,
  getIdsInManualMatches,
} from './resultsAugmentation';
import { ManualMatchModal } from './ManualMatchModal';
import { exportToExcel, exportToCsv } from './exportResults';
import type { ExceptionAnalysis } from './exceptionAnalysis';
import { fetchAnalyzeException } from './exceptionAnalysis';
import { ExceptionAnalysisPanel } from './ExceptionAnalysisPanel';
import { saveAiAnalysis } from '@/lib/database';
import { captureMatchAcceptance, captureMatchRejection } from '@/features/patterns/patternCapture';
import { detectAnomalies } from '@/features/anomalies/anomalyDetector';
import { AnomalyPanel } from '@/features/anomalies/AnomalyPanel';
import { CopilotPanel } from '@/features/copilot/CopilotPanel';

export interface ResultsPageProps {
  result: ReconciliationResult;
  reconciliationId?: string | null;
  organizationId?: string | null;
  sourceAName?: string;
  sourceBName?: string;
  className?: string;
}

function formatDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function formatAmount(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSideAmounts(transactions: Transaction[]): string {
  const sum = transactions.reduce((s, t) => s + t.amount, 0);
  if (transactions.length <= 1) return formatAmount(sum);
  return `${formatAmount(sum)} (${transactions.length})`;
}

function formatSideDates(transactions: Transaction[]): string {
  if (transactions.length === 0) return '—';
  if (transactions.length === 1) return formatDate(transactions[0].date);
  const range = transactions.map((t) => t.date.getTime()).filter((t) => !Number.isNaN(t));
  if (range.length === 0) return '—';
  const min = new Date(Math.min(...range));
  const max = new Date(Math.max(...range));
  return min.getTime() === max.getTime() ? formatDate(min) : `${formatDate(min)} – ${formatDate(max)}`;
}

function formatSideReferences(transactions: Transaction[]): string {
  if (transactions.length === 0) return '—';
  if (transactions.length === 1) return transactions[0].reference;
  return transactions.map((t) => t.reference).join('; ');
}

/** All unique field names from both sides of a match (from raw). */
function getAllFieldNames(m: MatchResult): string[] {
  const keys = new Set<string>();
  for (const t of [...m.transactionsA, ...m.transactionsB]) {
    for (const k of Object.keys(t.raw)) keys.add(k);
  }
  return Array.from(keys).sort();
}

function tryParseNumber(s: string): number | null {
  const n = parseFloat(String(s).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function tryParseDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysDiff(d1: Date, d2: Date): number {
  const ms = d2.getTime() - d1.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

interface MatchDetailPanelProps {
  match: MatchResult;
}

function MatchDetailPanel({ match }: MatchDetailPanelProps) {
  const fields = getAllFieldNames(match);
  const { transactionsA, transactionsB } = match;

  const getValuesA = (field: string) =>
    transactionsA.map((t) => t.raw[field] ?? '—');
  const getValuesB = (field: string) =>
    transactionsB.map((t) => t.raw[field] ?? '—');

  return (
    <div className="border-t bg-muted/30">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b">
            <TableHead className="w-[180px] font-medium">Field</TableHead>
            <TableHead className="font-medium">Source A</TableHead>
            <TableHead className="font-medium">Source B</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field) => {
            const valsA = getValuesA(field);
            const valsB = getValuesB(field);
            const strA = valsA.join(' | ') || '—';
            const strB = valsB.join(' | ') || '—';
            const same = valsA.length === 1 && valsB.length === 1 && valsA[0] === valsB[0];
            const numA = valsA.length === 1 ? tryParseNumber(valsA[0]) : null;
            const numB = valsB.length === 1 ? tryParseNumber(valsB[0]) : null;
            const dateA = valsA.length === 1 ? tryParseDate(valsA[0]) : null;
            const dateB = valsB.length === 1 ? tryParseDate(valsB[0]) : null;
            const isNumericDiff = !same && numA != null && numB != null;
            const isDateDiff = !same && dateA != null && dateB != null;
            const diffLabel =
              isNumericDiff && numA != null && numB != null
                ? (numB - numA >= 0 ? '+' : '') + formatAmount(numB - numA)
                : isDateDiff && dateA != null && dateB != null
                  ? (daysDiff(dateA, dateB) >= 0 ? '+' : '') + daysDiff(dateA, dateB) + ' days'
                  : null;

            return (
              <TableRow key={field} className="hover:bg-muted/50">
                <TableCell className="font-medium text-muted-foreground align-top">
                  {field}
                </TableCell>
                <TableCell
                  className={`align-top ${!same ? 'bg-yellow-200/70 dark:bg-yellow-900/30' : ''}`}
                >
                  {strA}
                </TableCell>
                <TableCell
                  className={`align-top ${!same ? 'bg-yellow-200/70 dark:bg-yellow-900/30' : ''}`}
                >
                  {strB}
                  {diffLabel != null && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({diffLabel})
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {(transactionsA.length > 1 || transactionsB.length > 1) && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-t">
          Group match: {transactionsA.length} transaction(s) on Source A,{' '}
          {transactionsB.length} on Source B. Values shown per field above.
        </div>
      )}
    </div>
  );
}

const MATCHED_TABLE_COLUMNS = 8; // chevron + confidence + 6 data columns

const PAGE_SIZE_OPTIONS = [50, 100, 250] as const;

interface PaginationBarProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}

function PaginationBar({ total, page, pageSize, onPageChange, onPageSizeChange }: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-row flex-wrap items-center justify-between gap-4 border-t pt-4 mt-4">
      <span className="text-sm text-muted-foreground">
        Showing {total === 0 ? 0 : start}-{end} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              onPageSizeChange(Number(v));
              onPageChange(1);
            }}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

type TabId = 'matched' | 'unmatchedA' | 'unmatchedB' | 'anomalies';

export function ResultsPage({ result, reconciliationId, organizationId, sourceAName = 'Source A', sourceBName = 'Source B', className }: ResultsPageProps) {
  const { matched, unmatchedA, unmatchedB, nearMissScores } = result;
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [augmentation, setAugmentation] = useState(createInitialAugmentation);
  const [activeTab, setActiveTab] = useState<TabId>('matched');

  const [matchedPage, setMatchedPage] = useState(1);
  const [matchedPageSize, setMatchedPageSize] = useState(100);
  const [unmatchedAPage, setUnmatchedAPage] = useState(1);
  const [unmatchedAPageSize, setUnmatchedAPageSize] = useState(100);
  const [unmatchedBPage, setUnmatchedBPage] = useState(1);
  const [unmatchedBPageSize, setUnmatchedBPageSize] = useState(100);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as TabId);
    if (value === 'matched') setMatchedPage(1);
    else if (value === 'unmatchedA') setUnmatchedAPage(1);
    else if (value === 'unmatchedB') setUnmatchedBPage(1);
    // AnomalyPanel manages its own pagination; resets on mount when tab is selected
  }, []);
  const [manualMatchOpen, setManualMatchOpen] = useState(false);
  const [manualMatchSource, setManualMatchSource] = useState<'sourceA' | 'sourceB' | null>(null);
  const [manualMatchTransaction, setManualMatchTransaction] = useState<Transaction | null>(null);

  const [analysisByTxId, setAnalysisByTxId] = useState<Record<string, ExceptionAnalysis>>({});
  const [followUpAnalysisByTxId, setFollowUpAnalysisByTxId] = useState<Record<string, ExceptionAnalysis>>({});
  const [loadingAnalysisTxId, setLoadingAnalysisTxId] = useState<string | null>(null);
  const [loadingFollowUpTxId, setLoadingFollowUpTxId] = useState<string | null>(null);
  const [openAnalysisTxId, setOpenAnalysisTxId] = useState<string | null>(null);
  const [errorByTxId, setErrorByTxId] = useState<Record<string, string>>({});
  const [copilotOpen, setCopilotOpen] = useState(false);

  const anomalyReport = useMemo(() => detectAnomalies(result), [result]);

  const { reviewedIds, ignoredIds, manualMatches, showIgnored } = augmentation;
  const manualMatchIds = useMemo(() => getIdsInManualMatches(manualMatches), [manualMatches]);
  const unmatchedADisplay = useMemo(
    () => getDisplayedUnmatched(unmatchedA, manualMatchIds, ignoredIds, showIgnored),
    [unmatchedA, manualMatchIds, ignoredIds, showIgnored]
  );
  const unmatchedBDisplay = useMemo(
    () => getDisplayedUnmatched(unmatchedB, manualMatchIds, ignoredIds, showIgnored),
    [unmatchedB, manualMatchIds, ignoredIds, showIgnored]
  );
  const matchedDisplay: Array<MatchResult & { isManual?: boolean; note?: string }> = useMemo(
    () => [
      ...matched.map((m) => ({ ...m, isManual: false as const })),
      ...manualMatches.map(({ match, note }) => ({ ...match, isManual: true, note })),
    ],
    [matched, manualMatches]
  );

  /** All transactions from the other source (for API context). */
  const otherSourceTransactionsA = useMemo(
    () => [
      ...matchedDisplay.flatMap((m) => m.transactionsB),
      ...unmatchedB.filter((x) => !manualMatchIds.has(x.id)),
    ],
    [matchedDisplay, unmatchedB, manualMatchIds]
  );
  const otherSourceTransactionsB = useMemo(
    () => [
      ...matchedDisplay.flatMap((m) => m.transactionsA),
      ...unmatchedA.filter((x) => !manualMatchIds.has(x.id)),
    ],
    [matchedDisplay, unmatchedA, manualMatchIds]
  );

  const reviewedCount = useMemo(() => {
    const stillUnmatchedA = unmatchedA.filter((t) => !manualMatchIds.has(t.id));
    const stillUnmatchedB = unmatchedB.filter((t) => !manualMatchIds.has(t.id));
    return (
      stillUnmatchedA.filter((t) => reviewedIds.has(t.id)).length +
      stillUnmatchedB.filter((t) => reviewedIds.has(t.id)).length
    );
  }, [unmatchedA, unmatchedB, manualMatchIds, reviewedIds]);
  const ignoredCount = useMemo(() => {
    const stillUnmatchedA = unmatchedA.filter((t) => !manualMatchIds.has(t.id));
    const stillUnmatchedB = unmatchedB.filter((t) => !manualMatchIds.has(t.id));
    return (
      stillUnmatchedA.filter((t) => ignoredIds.has(t.id)).length +
      stillUnmatchedB.filter((t) => ignoredIds.has(t.id)).length
    );
  }, [unmatchedA, unmatchedB, manualMatchIds, ignoredIds]);

  const toggleExpanded = (i: number) => {
    setExpandedIndex((prev) => (prev === i ? null : i));
  };

  const openManualMatch = (source: 'sourceA' | 'sourceB', t: Transaction) => {
    setManualMatchSource(source);
    setManualMatchTransaction(t);
    setManualMatchOpen(true);
  };

  const handleConfirmManualMatch = (selected: Transaction[], note: string) => {
    if (!manualMatchSource || !manualMatchTransaction) return;
    if (manualMatchSource === 'sourceA') {
      setAugmentation((prev) => ({
        ...prev,
        manualMatches: [
          ...prev.manualMatches,
          {
            match: {
              transactionsA: [manualMatchTransaction],
              transactionsB: selected,
              confidence: 1,
            },
            note: note || undefined,
          },
        ],
      }));
    } else {
      setAugmentation((prev) => ({
        ...prev,
        manualMatches: [
          ...prev.manualMatches,
          {
            match: {
              transactionsA: selected,
              transactionsB: [manualMatchTransaction],
              confidence: 1,
            },
            note: note || undefined,
          },
        ],
      }));
    }
    setManualMatchTransaction(null);
    setManualMatchSource(null);
  };

  const runAnalyze = async (
    source: 'sourceA' | 'sourceB',
    t: Transaction,
    options?: { followUpQuestion?: string; previousAnalysis?: ExceptionAnalysis }
  ) => {
    const isFollowUp = Boolean(options?.followUpQuestion?.trim() && options?.previousAnalysis);

    setErrorByTxId((prev) => {
      const next = { ...prev };
      delete next[t.id];
      return next as Record<string, string>;
    });
    setOpenAnalysisTxId(t.id);
    if (isFollowUp) {
      setLoadingFollowUpTxId(t.id);
    } else {
      setLoadingAnalysisTxId(t.id);
    }
    const otherSource =
      source === 'sourceA' ? otherSourceTransactionsA : otherSourceTransactionsB;
    const fetchResult = await fetchAnalyzeException({
      unmatchedTransaction: t,
      otherSourceTransactions: otherSource,
      matchedTransactions: matchedDisplay,
      matchingRules: result.config.rules,
      followUpQuestion: options?.followUpQuestion,
      previousAnalysis: options?.previousAnalysis,
    });
    if (isFollowUp) {
      setLoadingFollowUpTxId(null);
    } else {
      setLoadingAnalysisTxId(null);
    }
    if (fetchResult.success) {
      if (isFollowUp) {
        setFollowUpAnalysisByTxId((prev) => ({ ...prev, [t.id]: fetchResult.analysis }));
      } else {
        localStorage.setItem('rx_has_run_ai_analysis', 'true');
        window.dispatchEvent(new CustomEvent('rx-onboarding-update'));
        setFollowUpAnalysisByTxId((prev) => {
          const next = { ...prev };
          delete next[t.id];
          return next;
        });
        setAnalysisByTxId((prev) => ({ ...prev, [t.id]: fetchResult.analysis }));
      }
      setOpenAnalysisTxId(t.id);
      setErrorByTxId((prev) => {
        const next = { ...prev };
        delete next[t.id];
        return next as Record<string, string>;
      });
      if (reconciliationId) {
        const transaction_data = {
          id: t.id,
          source: t.source,
          amount: t.amount,
          date: t.date instanceof Date ? t.date.toISOString() : String(t.date),
          reference: t.reference,
          rowIndex: t.rowIndex,
          raw: t.raw,
        };
        const analysis_result = {
          probableCause: fetchResult.analysis.probableCause,
          recommendedAction: fetchResult.analysis.recommendedAction,
          suggestedMatch: fetchResult.analysis.suggestedMatch
            ? {
                reason: fetchResult.analysis.suggestedMatch.reason,
                confidence: fetchResult.analysis.suggestedMatch.confidence,
                amountDiff: fetchResult.analysis.suggestedMatch.amountDiff,
                dateDiffDays: fetchResult.analysis.suggestedMatch.dateDiffDays,
                nameSimilarityPct: fetchResult.analysis.suggestedMatch.nameSimilarityPct,
                transaction: {
                  ...fetchResult.analysis.suggestedMatch.transaction,
                  date:
                    fetchResult.analysis.suggestedMatch.transaction.date instanceof Date
                      ? fetchResult.analysis.suggestedMatch.transaction.date.toISOString()
                      : String(fetchResult.analysis.suggestedMatch.transaction.date),
                },
              }
            : undefined,
        };
        void saveAiAnalysis({ reconciliation_id: reconciliationId, transaction_data, analysis_result });
      }
    } else {
      setErrorByTxId((prev) => ({ ...prev, [t.id]: fetchResult.error }));
      setOpenAnalysisTxId(t.id);
    }
  };

  const handleAnalyzeException = (source: 'sourceA' | 'sourceB', t: Transaction, forceReAnalyze = false) => {
    // Toggle off if same row is already open
    if (openAnalysisTxId === t.id && analysisByTxId[t.id]) {
      setOpenAnalysisTxId(null);
      return;
    }
    if (!forceReAnalyze && analysisByTxId[t.id]) {
      setOpenAnalysisTxId(t.id);
      setErrorByTxId((prev) => {
        const next = { ...prev };
        delete next[t.id];
        return next as Record<string, string>;
      });
      return;
    }
    runAnalyze(source, t);
  };

  const handleRetryAnalysis = (source: 'sourceA' | 'sourceB', t: Transaction) => {
    setErrorByTxId((prev) => {
      const next = { ...prev };
      delete next[t.id];
      return next as Record<string, string>;
    });
    runAnalyze(source, t);
  };

  const handleReAnalyze = (source: 'sourceA' | 'sourceB', t: Transaction) => {
    setAnalysisByTxId((prev) => {
      const next = { ...prev };
      delete next[t.id];
      return next;
    });
    setFollowUpAnalysisByTxId((prev) => {
      const next = { ...prev };
      delete next[t.id];
      return next;
    });
    setErrorByTxId((prev) => {
      const next = { ...prev };
      delete next[t.id];
      return next as Record<string, string>;
    });
    runAnalyze(source, t);
  };

  const handleDismissAnalysis = (txId: string, rejectedCandidate?: Transaction) => {
    if (organizationId && rejectedCandidate) {
      const sourceTx = unmatchedA.find((x) => x.id === txId) ?? unmatchedB.find((x) => x.id === txId);
      if (sourceTx) {
        captureMatchRejection(organizationId, sourceTx, rejectedCandidate);
      }
    }
    setOpenAnalysisTxId((prev) => (prev === txId ? null : prev));
  };

  const handleAcceptAIMatch = (source: 'sourceA' | 'sourceB', sourceTx: Transaction, candidateTx: Transaction) => {
    if (source === 'sourceA') {
      setAugmentation((prev) => ({
        ...prev,
        manualMatches: [
          ...prev.manualMatches,
          {
            match: {
              transactionsA: [sourceTx],
              transactionsB: [candidateTx],
              confidence: 1,
            },
            note: 'AI Suggested',
          },
        ],
      }));
    } else {
      setAugmentation((prev) => ({
        ...prev,
        manualMatches: [
          ...prev.manualMatches,
          {
            match: {
              transactionsA: [candidateTx],
              transactionsB: [sourceTx],
              confidence: 1,
            },
            note: 'AI Suggested',
          },
        ],
      }));
    }
    if (organizationId) {
      captureMatchAcceptance(organizationId, sourceTx, candidateTx, result.config.rules);
    }
    setOpenAnalysisTxId(null);
  };

  const handleAskFollowUp = (txId: string, question: string) => {
    const t = unmatchedA.find((x) => x.id === txId) ?? unmatchedB.find((x) => x.id === txId);
    const source = t?.source === 'sourceA' ? 'sourceA' : 'sourceB';
    const previousAnalysis = analysisByTxId[txId];
    if (!t || !previousAnalysis) return;
    runAnalyze(source, t, { followUpQuestion: question, previousAnalysis });
  };

  const handleExportExcel = () => {
    exportToExcel(result, augmentation);
    localStorage.setItem('rx_has_exported_results', 'true');
    window.dispatchEvent(new CustomEvent('rx-onboarding-update'));
  };
  const handleExportCsv = () => {
    exportToCsv(result, augmentation);
    localStorage.setItem('rx_has_exported_results', 'true');
    window.dispatchEvent(new CustomEvent('rx-onboarding-update'));
  };

  // Clear analysis panel when changing pages
  useEffect(() => {
    setOpenAnalysisTxId(null);
  }, [unmatchedAPage, unmatchedBPage]);

  // Scroll to analysis panel when it loads
  useEffect(() => {
    if (openAnalysisTxId && analysisByTxId[openAnalysisTxId]) {
      const el = document.getElementById(`analysis-${openAnalysisTxId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [openAnalysisTxId, analysisByTxId]);

  const totalMatched = matchedDisplay.length;
  const totalUnmatchedA = unmatchedADisplay.length;
  const totalUnmatchedB = unmatchedBDisplay.length;

  // Dashboard metrics (dynamic with manual matches / status)
  const matchedTransactionSides = useMemo(
    () =>
      matchedDisplay.reduce(
        (s, m) => s + m.transactionsA.length + m.transactionsB.length,
        0
      ),
    [matchedDisplay]
  );
  const unmatchedCountA = useMemo(
    () => unmatchedA.filter((t) => !manualMatchIds.has(t.id)).length,
    [unmatchedA, manualMatchIds]
  );
  const unmatchedCountB = useMemo(
    () => unmatchedB.filter((t) => !manualMatchIds.has(t.id)).length,
    [unmatchedB, manualMatchIds]
  );
  const totalTransactions = useMemo(
    () => matchedTransactionSides + unmatchedCountA + unmatchedCountB,
    [matchedTransactionSides, unmatchedCountA, unmatchedCountB]
  );
  const reconciliationRatePct =
    totalTransactions > 0
      ? Math.round((matchedTransactionSides / totalTransactions) * 100)
      : 0;
  const rateColor =
    reconciliationRatePct >= 90
      ? 'text-green-600 dark:text-green-500'
      : reconciliationRatePct >= 70
        ? 'text-yellow-600 dark:text-yellow-500'
        : 'text-red-600 dark:text-red-500';

  const matchedAmount = useMemo(
    () =>
      matchedDisplay.reduce(
        (s, m) => s + m.transactionsA.reduce((sum, t) => sum + t.amount, 0),
        0
      ),
    [matchedDisplay]
  );
  const unmatchedAmountA = useMemo(
    () =>
      unmatchedA
        .filter((t) => !manualMatchIds.has(t.id))
        .reduce((s, t) => s + t.amount, 0),
    [unmatchedA, manualMatchIds]
  );
  const unmatchedAmountB = useMemo(
    () =>
      unmatchedB
        .filter((t) => !manualMatchIds.has(t.id))
        .reduce((s, t) => s + t.amount, 0),
    [unmatchedB, manualMatchIds]
  );

  return (
    <div className={className}>
      {/* Summary dashboard */}
      <section className="mb-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Reconciliation Rate */}
          <Card className="flex flex-col items-center justify-center py-4 card-accent-lavender border-[#E4DEFF]">
            <CardContent className="flex flex-col items-center gap-2 p-0">
              <div className="relative size-20">
                <svg className="size-20 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    className="text-muted stroke-current"
                    strokeWidth="2.5"
                    fill="none"
                    cx="18"
                    cy="18"
                    r="15.5"
                  />
                  <circle
                    className={rateColor + ' stroke-current'}
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(reconciliationRatePct / 100) * 97.39} 97.39`}
                    cx="18"
                    cy="18"
                    r="15.5"
                  />
                </svg>
                <span
                  className={`absolute inset-0 flex items-center justify-center text-lg font-semibold ${rateColor}`}
                >
                  {reconciliationRatePct}%
                </span>
              </div>
              <p className="text-muted-foreground text-xs font-medium">Reconciliation Rate</p>
              {anomalyReport &&
                anomalyReport.summary.critical + anomalyReport.summary.high > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-amber-600 dark:text-amber-500" title="Anomalies detected">
                    <AlertTriangle className="size-3.5" />
                    <span className="text-xs font-medium">
                      {anomalyReport.summary.critical + anomalyReport.summary.high} anomaly
                      {anomalyReport.summary.critical + anomalyReport.summary.high !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* 2. Matched Amount */}
          <Card className="py-4 card-accent-lavender border-[#E4DEFF]">
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs font-medium">Matched Amount</p>
              <p className="mt-1 text-xl font-semibold">${formatAmount(matchedAmount)}</p>
              <p className="text-muted-foreground text-xs">{totalMatched} pairs</p>
            </CardContent>
          </Card>

          {/* 3. Unmatched Amount A */}
          <Card className="py-4 card-accent-lavender border-[#E4DEFF]">
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs font-medium">Unmatched Amount A</p>
              <p className="mt-1 text-xl font-semibold">${formatAmount(unmatchedAmountA)}</p>
              <p className="text-muted-foreground text-xs">{unmatchedCountA} transactions</p>
            </CardContent>
          </Card>

          {/* 4. Unmatched Amount B */}
          <Card className="py-4 card-accent-lavender border-[#E4DEFF]">
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs font-medium">Unmatched Amount B</p>
              <p className="mt-1 text-xl font-semibold">${formatAmount(unmatchedAmountB)}</p>
              <p className="text-muted-foreground text-xs">{unmatchedCountB} transactions</p>
            </CardContent>
          </Card>
        </div>

      </section>

      {/* Unified toolbar: tabs left, action buttons right */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          {/* Left: Review stats (when visible) + Tabs */}
          <div className="flex flex-wrap items-center gap-4">
            {(reviewedCount > 0 || ignoredCount > 0 || manualMatches.length > 0) && (
              <div className="flex flex-wrap items-center gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 rounded-md bg-gray-50 px-3 py-1.5 text-sm">
                      <Eye className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-gray-500">Reviewed</span>
                      <span className="font-semibold text-[var(--app-heading)]">{reviewedCount}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Number of matched pairs you have reviewed and confirmed</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 rounded-md bg-gray-50 px-3 py-1.5 text-sm">
                      <EyeOff className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-gray-500">Ignored</span>
                      <span className="font-semibold text-[var(--app-heading)]">{ignoredCount}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Number of transactions you have marked to ignore (not relevant for this reconciliation)</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 rounded-md bg-gray-50 px-3 py-1.5 text-sm">
                      <Link2 className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-gray-500">Manual</span>
                      <span className="font-semibold text-[var(--app-heading)]">{manualMatches.length}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Number of pairs you have matched manually that the engine did not catch</p>
                  </TooltipContent>
                </Tooltip>
                {ignoredCount > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100">
                        <input
                          type="checkbox"
                          checked={showIgnored}
                          onChange={(e) =>
                            setAugmentation((prev) => ({ ...prev, showIgnored: e.target.checked }))
                          }
                          className="h-3.5 w-3.5 rounded border-gray-300 text-[var(--app-primary)] focus:ring-[var(--app-primary)]"
                        />
                        Show ignored
                      </label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Toggle visibility of transactions you marked as ignored</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
            <TabsList className="bg-transparent border-none p-0 h-auto gap-2 flex flex-wrap shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="matched"
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium border transition-colors cursor-pointer flex items-center gap-2",
                  activeTab === "matched"
                    ? "bg-[var(--app-primary-dark,#1E3A5F)] text-white border-[var(--app-primary-dark,#1E3A5F)] shadow-sm"
                    : "bg-white text-[var(--app-body)] border-[var(--app-border)] hover:bg-gray-50"
                )}
              >
                Matched
                <span className={cn(
                  "text-xs font-semibold px-1.5 py-0.5 rounded-md",
                  activeTab === "matched" ? "bg-white/20 text-white" : "bg-gray-100 text-[var(--app-body)]"
                )}>
                  {matchedDisplay.length}
                </span>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Transaction pairs that were automatically matched by the engine</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="unmatchedA"
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium border transition-colors cursor-pointer flex items-center gap-2",
                  activeTab === "unmatchedA"
                    ? "bg-[var(--app-primary-dark,#1E3A5F)] text-white border-[var(--app-primary-dark,#1E3A5F)] shadow-sm"
                    : "bg-white text-[var(--app-body)] border-[var(--app-border)] hover:bg-gray-50"
                )}
              >
                Unmatched Source A
                <span className={cn(
                  "text-xs font-semibold px-1.5 py-0.5 rounded-md",
                  activeTab === "unmatchedA" ? "bg-white/20 text-white" : "bg-gray-100 text-[var(--app-body)]"
                )}>
                  {unmatchedADisplay.length}
                </span>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Transactions from Source A that could not be matched to any transaction in Source B</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="unmatchedB"
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium border transition-colors cursor-pointer flex items-center gap-2",
                  activeTab === "unmatchedB"
                    ? "bg-[var(--app-primary-dark,#1E3A5F)] text-white border-[var(--app-primary-dark,#1E3A5F)] shadow-sm"
                    : "bg-white text-[var(--app-body)] border-[var(--app-border)] hover:bg-gray-50"
                )}
              >
                Unmatched Source B
                <span className={cn(
                  "text-xs font-semibold px-1.5 py-0.5 rounded-md",
                  activeTab === "unmatchedB" ? "bg-white/20 text-white" : "bg-gray-100 text-[var(--app-body)]"
                )}>
                  {unmatchedBDisplay.length}
                </span>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Transactions from Source B that could not be matched to any transaction in Source A</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="anomalies"
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium border transition-colors cursor-pointer flex items-center gap-2",
                  activeTab === "anomalies"
                    ? "bg-[var(--app-primary-dark,#1E3A5F)] text-white border-[var(--app-primary-dark,#1E3A5F)] shadow-sm"
                    : "bg-white text-[var(--app-body)] border-[var(--app-border)] hover:bg-gray-50"
                )}
              >
                Anomalies
                <span className={cn(
                  "text-xs font-semibold px-1.5 py-0.5 rounded-md",
                  activeTab === "anomalies" ? "bg-white/20 text-white" : "bg-gray-100 text-[var(--app-body)]"
                )}>
                  {anomalyReport?.anomalies.length ?? 0}
                </span>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Potential issues detected in your data: duplicates, unusual amounts, and other red flags</p>
            </TooltipContent>
          </Tooltip>
        </TabsList>
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => setCopilotOpen(true)}
                  className="rounded-xl border border-[var(--app-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--app-body)] hover:bg-gray-50"
                >
                  <Sparkles className="mr-1.5 h-4 w-4 text-purple-500" />
                  Ask Copilot
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Chat with the AI assistant about your reconciliation results — ask questions, get insights, and investigate exceptions</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="rounded-xl border border-[var(--app-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--app-body)] hover:bg-gray-50"
                    >
                      <Download className="mr-1.5 h-4 w-4" />
                      Export Results
                      <span className="ml-1.5 text-xs text-gray-400">
                        ({totalMatched} matched, {totalUnmatchedA + totalUnmatchedB} unmatched)
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Download all matched and unmatched transactions as a CSV or Excel file for your records</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportExcel}>
                  Export as Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCsv}>
                  Export as CSV (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <TabsContent value="matched" className="mt-4">
          <Card className="overflow-hidden">
            <TableSectionHeader>
              <span>Matched pairs</span>
              <p className="mt-0.5 text-xs font-normal opacity-90">Paired transactions with confidence score (1:1 and group matches)</p>
            </TableSectionHeader>
            <CardContent className="px-4 pb-4 pt-0 flex flex-col">
              <Table className="min-w-[1200px]">
                <TableHeader className="sticky top-0 z-[5]">
                  <TableRow className="bg-white hover:bg-white">
                    <TableHead className="w-8 bg-white" aria-label="Expand" />
                    <TableHead className="bg-white">
                      <div className="flex items-center gap-1">
                        Confidence
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                              aria-label="Confidence help"
                            >
                              <Info className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px]">
                            Percentage indicating how closely these transactions match based on
                            your configured rules and weights.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="text-right bg-white">Source A — Amount</TableHead>
                    <TableHead className="bg-white">Source A — Date</TableHead>
                    <TableHead className="bg-white">Source A — Reference</TableHead>
                    <TableHead className="text-right bg-white">Source B — Amount</TableHead>
                    <TableHead className="bg-white">Source B — Date</TableHead>
                    <TableHead className="bg-white">Source B — Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchedDisplay
                    .slice((matchedPage - 1) * matchedPageSize, matchedPage * matchedPageSize)
                    .map((m, idx) => {
                    const i = (matchedPage - 1) * matchedPageSize + idx;
                    const isExpanded = expandedIndex === i;
                    const isManual = 'isManual' in m && m.isManual;
                    return (
                      <Fragment key={i}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/70"
                          onClick={() => toggleExpanded(i)}
                        >
                          <TableCell className="w-8 p-2 text-muted-foreground">
                            {isExpanded ? (
                              <ChevronDown className="size-4" aria-hidden />
                            ) : (
                              <ChevronRight className="size-4" aria-hidden />
                            )}
                          </TableCell>
                          <TableCell>
                            {isManual ? (
                              <Badge variant="secondary">
                                {'note' in m && m.note === 'AI Suggested' ? 'AI Suggested' : 'Manual'}
                              </Badge>
                            ) : (
                              <Badge variant="default">
                                {(m.confidence * 100).toFixed(0)}%
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatSideAmounts(m.transactionsA)}</TableCell>
                          <TableCell>{formatSideDates(m.transactionsA)}</TableCell>
                          <TableCell className="max-w-[180px] truncate" title={formatSideReferences(m.transactionsA)}>
                            {formatSideReferences(m.transactionsA)}
                          </TableCell>
                          <TableCell className="text-right">{formatSideAmounts(m.transactionsB)}</TableCell>
                          <TableCell>{formatSideDates(m.transactionsB)}</TableCell>
                          <TableCell className="max-w-[180px] truncate" title={formatSideReferences(m.transactionsB)}>
                            {formatSideReferences(m.transactionsB)}
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-transparent border-b-0">
                          <TableCell
                            colSpan={MATCHED_TABLE_COLUMNS}
                            className="p-0 align-top"
                          >
                            <div
                              className="overflow-hidden transition-[max-height] duration-200 ease-out"
                              style={{
                                maxHeight: isExpanded ? 400 : 0,
                              }}
                              aria-hidden={!isExpanded}
                            >
                              <div className="max-h-[400px] overflow-auto">
                                <MatchDetailPanel match={m} />
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              {matchedDisplay.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">No matched pairs.</p>
              )}
              <PaginationBar
                total={matchedDisplay.length}
                page={matchedPage}
                pageSize={matchedPageSize}
                onPageChange={setMatchedPage}
                onPageSizeChange={(s) => { setMatchedPageSize(s); setMatchedPage(1); }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unmatchedA" className="mt-4">
          <Card className="overflow-hidden">
            <TableSectionHeader>
              <span>Unmatched Source A</span>
              <p className="mt-0.5 text-xs font-normal opacity-90">Transactions from Source A with no match in Source B</p>
            </TableSectionHeader>
            <CardContent className="px-4 pb-4 pt-0 flex flex-col">
              <Table className="table-fixed w-full min-w-[900px]">
                <TableHeader className="sticky top-0 z-[5]">
                  <TableRow className="bg-white hover:bg-white">
                    <TableHead className="bg-white">Row</TableHead>
                    <TableHead className="text-right bg-white">Amount</TableHead>
                    <TableHead className="bg-white">Date</TableHead>
                    <TableHead className="bg-white">Reference</TableHead>
                    <TableHead className="bg-white">Best Match</TableHead>
                    <TableHead className="w-[100px] text-right bg-white">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatchedADisplay
                    .slice((unmatchedAPage - 1) * unmatchedAPageSize, unmatchedAPage * unmatchedAPageSize)
                    .map((t) => {
                    const isReviewed = reviewedIds.has(t.id);
                    const isIgnored = ignoredIds.has(t.id);
                    const rowBg = isIgnored
                      ? 'bg-muted/70'
                      : isReviewed
                        ? 'bg-green-100/70 dark:bg-green-900/20'
                        : undefined;
                    const isLoading = loadingAnalysisTxId === t.id;
                    const showInlinePanel = openAnalysisTxId === t.id;
                    const nearMiss = nearMissScores?.[t.id];
                    return (
                      <Fragment key={t.id}>
                        <TableRow className={rowBg}>
                          <TableCell>{t.rowIndex}</TableCell>
                          <TableCell className="text-right">{formatAmount(t.amount)}</TableCell>
                          <TableCell>{formatDate(t.date)}</TableCell>
                          <TableCell className="max-w-[300px] truncate">{t.reference}</TableCell>
                          <TableCell>
                            {nearMiss ? (
                              <div className="flex items-center gap-1.5">
                                <div className={cn(
                                  'text-xs font-semibold px-2 py-0.5 rounded-md',
                                  nearMiss.bestScore >= 0.6
                                    ? 'bg-yellow-50 text-yellow-700'
                                    : nearMiss.bestScore >= 0.4
                                      ? 'bg-orange-50 text-orange-600'
                                      : 'bg-gray-100 text-gray-500'
                                )}>
                                  {Math.round(nearMiss.bestScore * 100)}%
                                </div>
                                <span className="text-[11px] text-gray-400">
                                  row {nearMiss.bestCandidateRowIndex}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              {isReviewed && (
                                <Badge variant="outline" className="text-xs font-normal">
                                  Reviewed
                                </Badge>
                              )}
                              {isIgnored && (
                                <Badge variant="secondary" className="text-xs font-normal">
                                  Ignored
                                </Badge>
                              )}
                              {isLoading ? (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Loader2 className="size-3.5 animate-spin" />
                                  Analyzing with AI...
                                </span>
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon-xs" className="h-7 w-7">
                                      <ChevronDown className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => handleAnalyzeException('sourceA', t)}
                                    >
                                      🤖 Analyze with AI
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        setAugmentation((prev) => ({
                                          ...prev,
                                          reviewedIds: new Set(prev.reviewedIds).add(t.id),
                                        }))
                                      }
                                    >
                                      <Check className="size-4 mr-2" />
                                      Mark as Reviewed
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        setAugmentation((prev) => ({
                                          ...prev,
                                          ignoredIds: new Set(prev.ignoredIds).add(t.id),
                                        }))
                                      }
                                    >
                                      <MinusCircle className="size-4 mr-2" />
                                      Ignore
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openManualMatch('sourceA', t)}>
                                      <Link2 className="size-4 mr-2" />
                                      Manual Match
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {showInlinePanel && (
                          <TableRow
                            id={`analysis-${t.id}`}
                            className="bg-blue-50/50 hover:bg-blue-50/50 border-l-4 border-l-blue-200 animate-in fade-in-0 slide-in-from-top-1 duration-200"
                          >
                            <TableCell colSpan={6} className="p-0 align-top">
                              <div className="p-4 border-t border-b border-blue-200">
                                {isLoading ? (
                                  <div className="flex items-center gap-2 py-6 text-muted-foreground">
                                    <Loader2 className="size-5 animate-spin" />
                                    <span>Analyzing with AI...</span>
                                  </div>
                                ) : (
                                  <ExceptionAnalysisPanel
                                    analysis={analysisByTxId[t.id] ?? null}
                                    followUpAnalysis={followUpAnalysisByTxId[t.id]}
                                    followUpLoading={loadingFollowUpTxId === t.id}
                                    error={errorByTxId[t.id]}
                                    sourceTransaction={t}
                                    onAcceptMatch={
                                      analysisByTxId[t.id]?.suggestedMatch
                                        ? (candidate) => handleAcceptAIMatch('sourceA', t, candidate)
                                        : undefined
                                    }
                                    onDismiss={(candidate) => handleDismissAnalysis(t.id, candidate)}
                                    onRetry={() => handleRetryAnalysis('sourceA', t)}
                                    onReAnalyze={() => handleReAnalyze('sourceA', t)}
                                    onAskFollowUp={(q) => handleAskFollowUp(t.id, q)}
                                  />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              {unmatchedADisplay.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">All Source A matched.</p>
              )}
              <PaginationBar
                total={unmatchedADisplay.length}
                page={unmatchedAPage}
                pageSize={unmatchedAPageSize}
                onPageChange={setUnmatchedAPage}
                onPageSizeChange={(s) => { setUnmatchedAPageSize(s); setUnmatchedAPage(1); }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unmatchedB" className="mt-4">
          <Card className="overflow-hidden">
            <TableSectionHeader>
              <span>Unmatched Source B</span>
              <p className="mt-0.5 text-xs font-normal opacity-90">Transactions from Source B with no match in Source A</p>
            </TableSectionHeader>
            <CardContent className="px-4 pb-4 pt-0 flex flex-col">
              <Table className="table-fixed w-full min-w-[900px]">
                <TableHeader className="sticky top-0 z-[5]">
                  <TableRow className="bg-white hover:bg-white">
                    <TableHead className="bg-white">Row</TableHead>
                    <TableHead className="text-right bg-white">Amount</TableHead>
                    <TableHead className="bg-white">Date</TableHead>
                    <TableHead className="bg-white">Reference</TableHead>
                    <TableHead className="bg-white">Best Match</TableHead>
                    <TableHead className="w-[100px] text-right bg-white">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatchedBDisplay
                    .slice((unmatchedBPage - 1) * unmatchedBPageSize, unmatchedBPage * unmatchedBPageSize)
                    .map((t) => {
                    const isReviewed = reviewedIds.has(t.id);
                    const isIgnored = ignoredIds.has(t.id);
                    const rowBg = isIgnored
                      ? 'bg-muted/70'
                      : isReviewed
                        ? 'bg-green-100/70 dark:bg-green-900/20'
                        : undefined;
                    const isLoading = loadingAnalysisTxId === t.id;
                    const showInlinePanel = openAnalysisTxId === t.id;
                    const nearMiss = nearMissScores?.[t.id];
                    return (
                      <Fragment key={t.id}>
                        <TableRow className={rowBg}>
                          <TableCell>{t.rowIndex}</TableCell>
                          <TableCell className="text-right">{formatAmount(t.amount)}</TableCell>
                          <TableCell>{formatDate(t.date)}</TableCell>
                          <TableCell className="max-w-[300px] truncate">{t.reference}</TableCell>
                          <TableCell>
                            {nearMiss ? (
                              <div className="flex items-center gap-1.5">
                                <div className={cn(
                                  'text-xs font-semibold px-2 py-0.5 rounded-md',
                                  nearMiss.bestScore >= 0.6
                                    ? 'bg-yellow-50 text-yellow-700'
                                    : nearMiss.bestScore >= 0.4
                                      ? 'bg-orange-50 text-orange-600'
                                      : 'bg-gray-100 text-gray-500'
                                )}>
                                  {Math.round(nearMiss.bestScore * 100)}%
                                </div>
                                <span className="text-[11px] text-gray-400">
                                  row {nearMiss.bestCandidateRowIndex}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              {isReviewed && (
                                <Badge variant="outline" className="text-xs font-normal">
                                  Reviewed
                                </Badge>
                              )}
                              {isIgnored && (
                                <Badge variant="secondary" className="text-xs font-normal">
                                  Ignored
                                </Badge>
                              )}
                              {isLoading ? (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Loader2 className="size-3.5 animate-spin" />
                                  Analyzing with AI...
                                </span>
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon-xs" className="h-7 w-7">
                                      <ChevronDown className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => handleAnalyzeException('sourceB', t)}
                                    >
                                      🤖 Analyze with AI
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        setAugmentation((prev) => ({
                                          ...prev,
                                          reviewedIds: new Set(prev.reviewedIds).add(t.id),
                                        }))
                                      }
                                    >
                                      <Check className="size-4 mr-2" />
                                      Mark as Reviewed
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        setAugmentation((prev) => ({
                                          ...prev,
                                          ignoredIds: new Set(prev.ignoredIds).add(t.id),
                                        }))
                                      }
                                    >
                                      <MinusCircle className="size-4 mr-2" />
                                      Ignore
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openManualMatch('sourceB', t)}>
                                      <Link2 className="size-4 mr-2" />
                                      Manual Match
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {showInlinePanel && (
                          <TableRow
                            id={`analysis-${t.id}`}
                            className="bg-blue-50/50 hover:bg-blue-50/50 border-l-4 border-l-blue-200 animate-in fade-in-0 slide-in-from-top-1 duration-200"
                          >
                            <TableCell colSpan={6} className="p-0 align-top">
                              <div className="p-4 border-t border-b border-blue-200">
                                {isLoading ? (
                                  <div className="flex items-center gap-2 py-6 text-muted-foreground">
                                    <Loader2 className="size-5 animate-spin" />
                                    <span>Analyzing with AI...</span>
                                  </div>
                                ) : (
                                  <ExceptionAnalysisPanel
                                    analysis={analysisByTxId[t.id] ?? null}
                                    followUpAnalysis={followUpAnalysisByTxId[t.id]}
                                    followUpLoading={loadingFollowUpTxId === t.id}
                                    error={errorByTxId[t.id]}
                                    sourceTransaction={t}
                                    onAcceptMatch={
                                      analysisByTxId[t.id]?.suggestedMatch
                                        ? (candidate) => handleAcceptAIMatch('sourceB', t, candidate)
                                        : undefined
                                    }
                                    onDismiss={(candidate) => handleDismissAnalysis(t.id, candidate)}
                                    onRetry={() => handleRetryAnalysis('sourceB', t)}
                                    onReAnalyze={() => handleReAnalyze('sourceB', t)}
                                    onAskFollowUp={(q) => handleAskFollowUp(t.id, q)}
                                  />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              {unmatchedBDisplay.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">All Source B matched.</p>
              )}
              <PaginationBar
                total={unmatchedBDisplay.length}
                page={unmatchedBPage}
                pageSize={unmatchedBPageSize}
                onPageChange={setUnmatchedBPage}
                onPageSizeChange={(s) => { setUnmatchedBPageSize(s); setUnmatchedBPage(1); }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anomalies" className="mt-4">
          <AnomalyPanel report={anomalyReport} />
        </TabsContent>
      </Tabs>

      {manualMatchTransaction && (
        <ManualMatchModal
          open={manualMatchOpen}
          onOpenChange={(open) => {
            setManualMatchOpen(open);
            if (!open) {
              setManualMatchTransaction(null);
              setManualMatchSource(null);
            }
          }}
          sourceTransaction={manualMatchTransaction}
          otherUnmatched={manualMatchSource === 'sourceA' ? unmatchedB : unmatchedA}
          excludeIds={manualMatchIds}
          onConfirm={handleConfirmManualMatch}
        />
      )}

      <CopilotPanel
        result={result}
        anomalyReport={anomalyReport}
        sourceAName={sourceAName}
        sourceBName={sourceBName}
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
      />
    </div>
  );
}
