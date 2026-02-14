import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import type { MatchingConfig } from '@/features/reconciliation/types';
import { getReconciliations } from '@/lib/database';
import type { ReconciliationRow } from '@/lib/database';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

const headingStyle = { fontFamily: 'var(--font-heading)' };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatMatchType(mt: string): string {
  const map: Record<string, string> = {
    exact: 'Exact',
    tolerance_numeric: 'Tolerance (numeric)',
    tolerance_date: 'Tolerance (date)',
    similar_text: 'Similar text',
    contains: 'Contains',
  };
  return map[mt] ?? mt;
}

function MatchRateBadge({ rate }: { rate: number }) {
  const pct = Math.round(rate <= 1 ? rate * 100 : rate);
  const colorClass =
    pct >= 80
      ? 'text-emerald-600'
      : pct >= 50
        ? 'text-amber-500'
        : 'text-red-500';
  return (
    <span className={cn('text-sm font-semibold tabular-nums', colorClass)}>
      {pct}%
    </span>
  );
}

function TableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
          <TableHead className="py-3 px-5 text-xs font-medium uppercase tracking-wider text-slate-500">Date</TableHead>
          <TableHead className="py-3 px-5 text-xs font-medium uppercase tracking-wider text-slate-500">Name / Files</TableHead>
          <TableHead className="py-3 px-5 text-xs font-medium uppercase tracking-wider text-slate-500">Match Rate</TableHead>
          <TableHead className="py-3 px-5 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Matched</TableHead>
          <TableHead className="py-3 px-5 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Unmatched</TableHead>
          <TableHead className="py-3 px-5 text-xs font-medium uppercase tracking-wider text-slate-500">Status</TableHead>
          <TableHead className="w-[120px] py-3 px-5 text-xs font-medium uppercase tracking-wider text-slate-500">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[1, 2, 3, 4, 5].map((i) => (
          <TableRow key={i}>
            <TableCell><div className="h-5 w-24 rounded bg-muted animate-pulse" /></TableCell>
            <TableCell><div className="h-5 w-40 rounded bg-muted animate-pulse" /></TableCell>
            <TableCell><div className="h-6 w-14 rounded bg-muted animate-pulse" /></TableCell>
            <TableCell><div className="h-5 w-8 rounded bg-muted animate-pulse" /></TableCell>
            <TableCell><div className="h-5 w-12 rounded bg-muted animate-pulse" /></TableCell>
            <TableCell><div className="h-5 w-16 rounded bg-muted animate-pulse" /></TableCell>
            <TableCell><div className="h-8 w-24 rounded bg-muted animate-pulse" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function HistoryPage() {
  const { organizationId } = useAuth();
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRec, setSelectedRec] = useState<ReconciliationRow | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getReconciliations(organizationId)
      .then(setRows)
      .catch(() => setError('Failed to load history.'))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const empty = !loading && rows.length === 0;

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--app-heading)]">
          History
        </h1>
        <p className="mt-1 text-sm text-[var(--app-body)]">
          Past reconciliations and their results
        </p>
      </header>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {loading && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
          <TableSkeleton />
        </div>
      )}

      {!loading && !empty && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
          <div className="border-b border-slate-200/60 px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--app-heading)]">
              Reconciliation History
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="py-3 px-5 text-xs font-medium uppercase tracking-wider text-slate-500">Date</TableHead>
                <TableHead className="py-3 px-5 text-xs font-medium uppercase tracking-wider text-slate-500">Name / Files</TableHead>
                <TableHead className="py-3 px-5 text-xs font-medium uppercase tracking-wider text-slate-500">Match Rate</TableHead>
                <TableHead className="py-3 px-5 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Matched</TableHead>
                <TableHead className="py-3 px-5 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Unmatched</TableHead>
                <TableHead className="py-3 px-5 text-xs font-medium uppercase tracking-wider text-slate-500">Status</TableHead>
                <TableHead className="w-[120px] py-3 px-5 text-xs font-medium uppercase tracking-wider text-slate-500">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="border-b border-slate-100 last:border-b-0 transition-colors hover:bg-slate-50/50"
                >
                  <TableCell className="py-4 px-5 text-sm text-[var(--app-body)]">
                    {formatDate(r.created_at)}
                  </TableCell>
                  <TableCell className="py-4 px-5">
                    <span className="text-sm font-medium text-[var(--app-heading)]">
                      {r.source_a_name} vs {r.source_b_name}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 px-5">
                    <MatchRateBadge rate={r.match_rate} />
                  </TableCell>
                  <TableCell className="py-4 px-5 text-right text-sm tabular-nums text-[var(--app-body)]">{r.matched_count}</TableCell>
                  <TableCell className="py-4 px-5 text-right text-sm tabular-nums text-[var(--app-body)]">{r.unmatched_a_count + r.unmatched_b_count}</TableCell>
                  <TableCell className="py-4 px-5">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      Complete
                    </span>
                  </TableCell>
                  <TableCell className="py-4 px-5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-[var(--app-body)] transition-colors hover:text-[var(--app-heading)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRec(r);
                      }}
                    >
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {empty && !organizationId && (
        <div className="rounded-2xl border border-slate-200/60 bg-white p-14 text-center shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
          <p className="text-sm text-[var(--app-body)]">Add yourself to an organization to see reconciliation history.</p>
        </div>
      )}

      {empty && organizationId && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/60 bg-white py-14 text-center shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--app-bg-subtle)] text-[var(--app-body)]">
              <ClipboardList className="h-7 w-7" />
            </div>
            <p className="mt-4 max-w-sm text-[var(--app-body)]">
              No reconciliations yet. Start your first one to see it here.
            </p>
            <Link to="/reconciliation/new">
              <Button className="mt-4">New Reconciliation</Button>
            </Link>
        </div>
      )}

      <Dialog open={selectedRec !== null} onOpenChange={(open) => { if (!open) setSelectedRec(null); }}>
        <DialogContent className="max-w-md">
          {selectedRec && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--app-heading)]" style={headingStyle}>
                  Reconciliation Details
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Summary for {selectedRec.source_a_name} vs {selectedRec.source_b_name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">Source A</span>
                  <span className="font-medium">{selectedRec.source_a_name}</span>
                  <span className="text-muted-foreground">Source B</span>
                  <span className="font-medium">{selectedRec.source_b_name}</span>
                  <span className="text-muted-foreground">Date created</span>
                  <span className="font-medium">{formatDate(selectedRec.created_at)}</span>
                  <span className="text-muted-foreground">Source A rows</span>
                  <span className="font-medium">{selectedRec.source_a_rows}</span>
                  <span className="text-muted-foreground">Source B rows</span>
                  <span className="font-medium">{selectedRec.source_b_rows}</span>
                  <span className="text-muted-foreground">Matched count</span>
                  <span className="font-medium">{selectedRec.matched_count}</span>
                  <span className="text-muted-foreground">Unmatched A</span>
                  <span className="font-medium">{selectedRec.unmatched_a_count}</span>
                  <span className="text-muted-foreground">Unmatched B</span>
                  <span className="font-medium">{selectedRec.unmatched_b_count}</span>
                  <span className="text-muted-foreground">Match rate</span>
                  <span className="font-medium">
                    <MatchRateBadge rate={selectedRec.match_rate} />
                  </span>
                  <span className="text-muted-foreground">Matched amount</span>
                  <span className="font-medium">{formatCurrency(selectedRec.matched_amount ?? 0)}</span>
                  <span className="text-muted-foreground">Matching type</span>
                  <span className="font-medium">
                    {selectedRec.matching_type === 'oneToOne' ? '1:1' : selectedRec.matching_type === 'group' ? 'Group' : selectedRec.matching_type}
                  </span>
                </div>
                {(() => {
                  const config = selectedRec.rules_config as MatchingConfig | undefined;
                  const rules = config?.rules ?? [];
                  if (rules.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <span className="text-muted-foreground">Rules used</span>
                      <ul className="space-y-2 rounded-md border border-slate-200 p-3">
                        {rules.map((rule) => (
                          <li key={rule.id} className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
                            <span className="font-medium">{rule.columnA}</span>
                            <span className="text-muted-foreground">↔</span>
                            <span className="font-medium">{rule.columnB}</span>
                            <span className="text-muted-foreground">·</span>
                            <span>{formatMatchType(rule.matchType)}</span>
                            <span className="text-muted-foreground">·</span>
                            <span>Weight: {Math.round((rule.weight ?? 1) * 100)}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Close</Button>
                </DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
