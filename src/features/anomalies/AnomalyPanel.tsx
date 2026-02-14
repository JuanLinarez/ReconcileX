import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { Anomaly, AnomalyReport, AnomalySeverity } from './anomalyDetector';
import { cn } from '@/lib/utils';

function formatDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function formatAmount(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AnomalyIcon({ severity }: { severity: AnomalySeverity }) {
  if (severity === 'critical' || severity === 'high') {
    return <AlertTriangle className="size-4 shrink-0" />;
  }
  if (severity === 'medium') {
    return <AlertCircle className="size-4 shrink-0" />;
  }
  return <Info className="size-4 shrink-0" />;
}

function severityBorderClass(severity: AnomalySeverity): string {
  switch (severity) {
    case 'critical':
      return 'border-l-4 border-red-500';
    case 'high':
      return 'border-l-4 border-orange-500';
    case 'medium':
      return 'border-l-4 border-yellow-500';
    case 'low':
      return 'border-l-4 border-blue-500';
    default:
      return '';
  }
}

export interface AnomalyPanelProps {
  report: AnomalyReport;
  className?: string;
}

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const [expanded, setExpanded] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);

  return (
    <Card
      className={cn(
        'overflow-hidden transition-colors',
        severityBorderClass(anomaly.severity)
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 mt-0.5 -ml-1"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <AnomalyIcon severity={anomaly.severity} />
              <span className="font-semibold">{anomaly.title}</span>
              <Badge variant="secondary" className="text-xs font-normal">
                Risk Score: {anomaly.riskScore}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{anomaly.description}</p>
            {expanded && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mb-2 -ml-1"
                  onClick={() => setShowTransactions(!showTransactions)}
                >
                  {showTransactions ? 'Hide' : 'Show'} affected transactions (
                  {anomaly.affectedTransactions.length})
                </Button>
                {showTransactions && (
                  <div className="mb-3 rounded-md border overflow-hidden">
                    <Table className="min-w-[500px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-16">Row</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Reference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {anomaly.affectedTransactions.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell>{t.rowIndex}</TableCell>
                            <TableCell>{t.source}</TableCell>
                            <TableCell className="text-right">{formatAmount(t.amount)}</TableCell>
                            <TableCell>{formatDate(t.date)}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{t.reference}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="text-sm italic text-muted-foreground">
                  {anomaly.recommendedAction}
                </p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnomalyPanel({ report, className }: AnomalyPanelProps) {
  const { anomalies, summary } = report;

  if (anomalies.length === 0) {
    return (
      <Card className={cn('border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20', className)}>
        <CardContent className="flex items-center gap-3 py-8">
          <CheckCircle className="size-10 text-green-600 dark:text-green-500 shrink-0" />
          <div>
            <p className="font-medium text-green-800 dark:text-green-200">
              No anomalies detected.
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              Your reconciliation data looks clean.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const riskColor =
    summary.totalRiskScore >= 70
      ? 'text-red-600 dark:text-red-500'
      : summary.totalRiskScore >= 50
        ? 'text-orange-600 dark:text-orange-500'
        : summary.totalRiskScore >= 30
          ? 'text-yellow-600 dark:text-yellow-500'
          : 'text-blue-600 dark:text-blue-500';

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const totalPages = Math.max(1, Math.ceil(anomalies.length / pageSize));
  const start = (page - 1) * pageSize;
  const paginatedAnomalies = anomalies.slice(start, start + pageSize);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Dark section header */}
      <div className="rounded-t-lg overflow-hidden">
        <TableSectionHeader>
          <span>Detected Anomalies</span>
        </TableSectionHeader>
      </div>
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant="outline"
          className="border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          Critical: {summary.critical}
        </Badge>
        <Badge
          variant="outline"
          className="border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
        >
          High: {summary.high}
        </Badge>
        <Badge
          variant="outline"
          className="border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300"
        >
          Medium: {summary.medium}
        </Badge>
        <Badge
          variant="outline"
          className="border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
        >
          Low: {summary.low}
        </Badge>
        <span className={cn('font-semibold', riskColor)}>
          Risk Score: {Math.round(summary.totalRiskScore)}/100
        </span>
      </div>

      {/* Anomaly list */}
      <div className="space-y-3">
        {paginatedAnomalies.map((anomaly) => (
          <AnomalyCard key={anomaly.id} anomaly={anomaly} />
        ))}
      </div>

      {/* Pagination */}
      {anomalies.length > 0 && (
        <div className="flex flex-row flex-wrap items-center justify-between gap-4 border-t pt-4 mt-4">
          <span className="text-sm text-muted-foreground">
            Showing {anomalies.length === 0 ? 0 : start + 1}-{Math.min(start + pageSize, anomalies.length)} of {anomalies.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="250">250</SelectItem>
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
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
