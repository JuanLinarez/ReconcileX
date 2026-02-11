import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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

function MatchRateBadge({ rate }: { rate: number }) {
  const pct = Math.round(rate);
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
      <h1 className="text-2xl font-semibold text-[var(--app-heading)]" style={headingStyle}>
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
          <CardContent className="p-0">
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
                    <TableCell>{r.matched_count}</TableCell>
                    <TableCell>{r.unmatched_a_count + r.unmatched_b_count}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        Complete
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" disabled>
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
    </div>
  );
}
