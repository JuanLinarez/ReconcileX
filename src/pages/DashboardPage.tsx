import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Check, ChevronRight, ClipboardList, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  const [matchedThisWeek, setMatchedThisWeek] = useState(0);
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
      .then((rows) => {
        setRecentRows(rows.slice(0, 10));
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const weekSum = rows
          .filter((r) => new Date(r.created_at) >= startOfWeek)
          .reduce((sum, r) => sum + r.matched_count, 0);
        setMatchedThisWeek(weekSum);
      })
      .finally(() => setRecentLoading(false));
  }, [organizationId]);

  const matchRatePct = stats.avgMatchRate != null
    ? Math.round(stats.avgMatchRate <= 1 ? stats.avgMatchRate * 100 : stats.avgMatchRate)
    : null;

  return (
    <div className="pb-8">
      {/* Header: title + CTA */}
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-[var(--app-body)]">ReconcileX</p>
          <h1 className="text-3xl font-bold text-[var(--app-heading)]" style={headingStyle}>
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--app-body)]">
            {getGreeting()}, {displayName} — {getTodayLabel()}
          </p>
        </div>
        <Link to="/reconciliation/new" className="shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-[#1E3A5F] px-5 py-2.5 font-medium text-white shadow-md transition-colors hover:bg-[#24476F]"
          >
            <Plus className="h-4 w-4" />
            New Reconciliation
          </button>
        </Link>
      </section>

      {/* Stats Cards */}
      <section className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Reconciliations */}
        <div
          className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.06)]"
        >
          <p className="mb-2 text-sm text-[var(--app-body)]">Total Reconciliations</p>
          <p className="text-3xl font-bold tabular-nums text-[var(--app-heading)]" style={headingStyle}>
            {statsLoading ? '…' : formatNumber(stats.total)}
          </p>
        </div>

        {/* Average Match Rate */}
        <div
          className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.06)]"
        >
          <p className="mb-2 text-sm text-[var(--app-body)]">Average Match Rate</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-[var(--app-heading)]" style={headingStyle}>
              {statsLoading ? '…' : matchRatePct != null ? `${matchRatePct}%` : '—'}
            </span>
            {matchRatePct != null && (
              <span className="text-sm font-medium text-emerald-500">△33%</span>
            )}
          </div>
        </div>

        {/* Records Processed */}
        <div
          className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.06)]"
        >
          <p className="mb-2 text-sm text-[var(--app-body)]">Records Processed</p>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold tabular-nums text-[var(--app-heading)]" style={headingStyle}>
              {statsLoading ? '…' : formatNumber(stats.totalRecordsProcessed)}
            </span>
            <svg width="80" height="32" viewBox="0 0 80 32" className="shrink-0 text-emerald-400">
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points="0,28 10,24 20,26 30,20 40,22 50,14 60,10 70,8 80,4"
              />
            </svg>
          </div>
        </div>

        {/* Total Matched */}
        <div
          className="rounded-2xl border border-slate-200/60 border-r-2 border-r-violet-300 bg-white p-5 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.06)]"
        >
          <p className="mb-2 text-sm text-[var(--app-body)]">Total Matched</p>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold tabular-nums text-[var(--app-heading)]" style={headingStyle}>
              {statsLoading ? '…' : formatNumber(stats.totalMatched)}
            </span>
            <svg width="80" height="32" viewBox="0 0 80 32" className="shrink-0 text-emerald-400">
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points="0,28 12,22 24,25 36,18 48,15 60,10 72,6 80,2"
              />
            </svg>
          </div>
          {!statsLoading && (
            <p className="mt-1 text-xs text-emerald-500">
              + {formatNumber(matchedThisWeek)} this week
            </p>
          )}
        </div>
      </section>

      {/* Recent Reconciliations */}
      <section className="mb-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
          <h2 className="mb-3 p-5 pb-0 text-sm font-bold uppercase tracking-wider text-[var(--app-heading)]">
            Recent Reconciliations
          </h2>
          {recentLoading ? (
            <div className="space-y-4 p-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : recentRows.length === 0 ? (
            <>
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--app-bg-subtle)] text-[var(--app-body)]">
                  <ClipboardList className="h-7 w-7" />
                </div>
                <p className="mt-4 max-w-sm text-[var(--app-body)]">
                  No reconciliations yet. Start your first one!
                </p>
                <Link to="/reconciliation/new" className="mt-4">
                  <Button variant="default">
                    <Plus className="h-4 w-4" />
                    New Reconciliation
                  </Button>
                </Link>
              </div>
              <Link
                to="/history"
                className="flex items-center gap-1 px-5 pb-4 pt-3 text-sm text-[var(--app-body)] transition-colors hover:cursor-pointer hover:text-[var(--app-heading)]"
              >
                View all
                <ChevronRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="px-5 py-3 text-sm font-normal text-[var(--app-body)]">
                      Sources
                    </TableHead>
                    <TableHead className="px-5 py-3 text-sm font-normal text-[var(--app-body)]">
                      Date
                    </TableHead>
                    <TableHead className="px-5 py-3 text-right text-sm font-normal text-[var(--app-body)]">
                      Records
                    </TableHead>
                    <TableHead className="px-5 py-3 text-right text-sm font-normal text-[var(--app-body)]">
                      Match Rate
                    </TableHead>
                    <TableHead className="px-5 py-3 text-sm font-normal text-[var(--app-body)]">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="border-b border-slate-100 transition-colors hover:bg-slate-50/50 last:border-b-0"
                    >
                      <TableCell className="px-5 py-3.5 text-sm text-[var(--app-heading)]">
                        {r.source_a_name} vs {r.source_b_name}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-sm text-[var(--app-body)]">
                        {formatRecDate(r.created_at)}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--app-body)]">
                        {formatNumber(r.source_a_rows + r.source_b_rows)}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-right">
                        <span className="text-sm font-medium text-emerald-500">
                          △ {Math.round(r.match_rate <= 1 ? r.match_rate * 100 : r.match_rate)}% <Check className="inline h-3.5 w-3.5" />
                        </span>
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-sm text-emerald-500">
                        Complete
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Link
                to="/history"
                className="mt-3 flex items-center gap-1 px-5 pb-4 pt-3 text-sm text-[var(--app-body)] transition-colors hover:cursor-pointer hover:text-[var(--app-heading)]"
              >
                View all
                <ChevronRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
