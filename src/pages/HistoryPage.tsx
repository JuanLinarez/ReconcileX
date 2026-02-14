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
  TableSectionHeader,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  const bgClass =
    pct >= 80
      ? 'bg-[var(--app-success)]/15 text-[var(--app-success)]'
      : pct >= 50
        ? 'bg-[var(--app-warning)]/15 text-[var(--app-warning)]'
        : 'bg-[var(--app-error)]/15 text-[var(--app-error)]';
  return (
    <Badge variant="secondary" className={cn('font-medium', bgClass)}>
      {pct}%
    </Badge>
  );
}

function TableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Name / Files</TableHead>
          <TableHead>Match Rate</TableHead>
          <TableHead>Matched</TableHead>
          <TableHead>Unmatched</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[120px]">Actions</TableHead>
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
      <h1 className="text-3xl font-bold font-heading text-[var(--app-heading)] mb-8">
        Reconciliation History
      </h1>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {loading && (
        <Card className="border-[var(--app-border)] overflow-hidden">
          <CardContent className="p-0">
            <TableSkeleton />
          </CardContent>
        </Card>
      )}

      {!loading && !empty && (
        <Card className="border-[var(--app-border)] overflow-hidden">
          <TableSectionHeader>
            <span>Reconciliation History</span>
          </TableSectionHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name / Files</TableHead>
                  <TableHead>Match Rate</TableHead>
                  <TableHead className="text-right">Matched</TableHead>
                  <TableHead className="text-right">Unmatched</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[var(--app-body)] font-body">
                      {formatDate(r.created_at)}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-[var(--app-heading)]">
                        {r.source_a_name} vs {r.source_b_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <MatchRateBadge rate={r.match_rate} />
                    </TableCell>
                    <TableCell className="text-right">{r.matched_count}</TableCell>
                    <TableCell className="text-right">{r.unmatched_a_count + r.unmatched_b_count}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        Complete
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
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
          </CardContent>
        </Card>
      )}

      {empty && !organizationId && (
        <Card className="border-[var(--app-border)]">
          <CardContent className="flex flex-col items-center justify-center py-14 text-center">
            <p className="text-[var(--app-body)]">Add yourself to an organization to see reconciliation history.</p>
          </CardContent>
        </Card>
      )}

      {empty && organizationId && (
        <Card className="border-[var(--app-border)]">
          <CardContent className="flex flex-col items-center justify-center py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--app-bg-subtle)] text-[var(--app-body)]">
              <ClipboardList className="h-7 w-7" />
            </div>
            <p className="mt-4 max-w-sm text-[var(--app-body)]">
              No reconciliations yet. Start your first one to see it here.
            </p>
            <Link to="/reconciliation/new">
              <Button className="mt-4">New Reconciliation</Button>
            </Link>
          </CardContent>
        </Card>
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
                      <ul className="space-y-2 rounded-md border border-[var(--app-border)] p-3">
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
