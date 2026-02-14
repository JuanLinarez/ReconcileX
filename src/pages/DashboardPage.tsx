import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ClipboardList, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { getReconciliationStats, getReconciliations } from '@/lib/database';
import type { ReconciliationRow } from '@/lib/database';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const headingStyle = { fontFamily: 'var(--font-heading)' };

function getDisplayFirstName(user: { user_metadata?: { full_name?: string }; email?: string | null } | null): string {
  if (!user) return 'there';
  const name = user.user_metadata?.full_name?.trim();
  if (name) {
    const first = name.split(/\s+/)[0];
    if (first) return first;
  }
  const email = user.email ?? '';
  const local = email.split('@')[0];
  if (local) return local;
  return 'there';
}

function formatRecDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function DashboardPage() {
  const { user, organizationId } = useAuth();
  const displayName = getDisplayFirstName(user);

  const [stats, setStats] = useState<{
    total: number;
    avgMatchRate: number | null;
    totalRecordsProcessed: number;
    totalMatched: number;
  }>({ total: 0, avgMatchRate: null, totalRecordsProcessed: 0, totalMatched: 0 });
  const [recentRows, setRecentRows] = useState<ReconciliationRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      setStats({ total: 0, avgMatchRate: null, totalRecordsProcessed: 0, totalMatched: 0 });
      setStatsLoading(false);
      return;
    }
    setStatsLoading(true);
    getReconciliationStats(organizationId)
      .then((s) => setStats({
        total: s.total_reconciliations,
        avgMatchRate: s.average_match_rate,
        totalRecordsProcessed: s.total_records_processed,
        totalMatched: s.total_matched,
      }))
      .finally(() => setStatsLoading(false));
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) {
      setRecentRows([]);
      setRecentLoading(false);
      return;
    }
    setRecentLoading(true);
    getReconciliations(organizationId)
      .then((rows) => setRecentRows(rows.slice(0, 10)))
      .finally(() => setRecentLoading(false));
  }, [organizationId]);

  const statsCards = [
    { label: 'Total Reconciliations', value: statsLoading ? '…' : formatNumber(stats.total) },
    { label: 'Average Match Rate', value: statsLoading ? '…' : stats.avgMatchRate != null ? `${Math.round(stats.avgMatchRate <= 1 ? stats.avgMatchRate * 100 : stats.avgMatchRate)}%` : '—' },
    { label: 'Records Processed', value: statsLoading ? '…' : formatNumber(stats.totalRecordsProcessed) },
    { label: 'Total Matched', value: statsLoading ? '…' : formatNumber(stats.totalMatched) },
  ];

  return (
    <div className="space-y-10 pb-8">
      {/* Header: title + CTA */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="text-3xl font-bold font-heading text-[var(--app-heading)]"
            style={headingStyle}
          >
            Dashboard
          </h1>
          <p className="mt-1 text-base text-[var(--app-body)]">
            {getGreeting()}, {displayName} — {getTodayLabel()}
          </p>
        </div>
        <Link to="/reconciliation/new" className="shrink-0">
          <Button
            variant="dark"
            className="rounded-xl px-6 py-2.5 font-medium"
          >
            <Plus className="h-5 w-5" />
            New Reconciliation
          </Button>
        </Link>
      </section>

      {/* Stats Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map(({ label, value }) => (
          <Card
            key={label}
            className="bg-white border border-[var(--app-border)] rounded-xl p-6 shadow-sm"
          >
            <CardContent className="p-0">
              <p className="text-sm font-medium text-[var(--app-body)]">{label}</p>
              <p className="mt-2 text-3xl font-bold font-heading text-[var(--app-heading)]" style={headingStyle}>
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Recent Reconciliations */}
      <section>
        <Card className="border-[var(--app-border)] bg-white overflow-hidden rounded-xl">
          <TableSectionHeader>
            <span>Recent Reconciliations</span>
          </TableSectionHeader>
          {recentLoading ? (
            <CardContent className="py-10">
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 rounded bg-muted animate-pulse" />
                ))}
              </div>
            </CardContent>
          ) : recentRows.length === 0 ? (
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--app-bg-subtle)] text-[var(--app-body)]">
                <ClipboardList className="h-7 w-7" />
              </div>
              <p className="mt-4 max-w-sm text-[var(--app-body)]">
                No reconciliations yet. Start your first one!
              </p>
              <Link to="/reconciliation/new" className="mt-4">
                <Button variant="dark">New Reconciliation</Button>
              </Link>
            </CardContent>
          ) : (
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sources</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead className="text-right">Match Rate</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-[var(--app-heading)]">
                        {r.source_a_name} vs {r.source_b_name}
                      </TableCell>
                      <TableCell className="text-[var(--app-body)]">
                        {formatRecDate(r.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(r.source_a_rows + r.source_b_rows)}
                      </TableCell>
                      <TableCell className="text-right">
                        {Math.round(r.match_rate <= 1 ? r.match_rate * 100 : r.match_rate)}%
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          Complete
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t border-[var(--app-border)] px-6 py-3">
                <Link to="/history">
                  <Button variant="ghost" size="sm">View all</Button>
                </Link>
              </div>
            </CardContent>
          )}
        </Card>
      </section>
    </div>
  );
}
