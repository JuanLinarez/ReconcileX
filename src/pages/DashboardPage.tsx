import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Check, ClipboardList, Plus, Sparkles, TrendingUp } from 'lucide-react';
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
  const navigate = useNavigate();
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

  const matchRatePct = stats.avgMatchRate != null
    ? Math.round(stats.avgMatchRate <= 1 ? stats.avgMatchRate * 100 : stats.avgMatchRate)
    : null;

  const aiSuggestions = [
    'Exact amount, date ±3 days, similar vendors',
    'Amount within 2%, date ±7 days',
    'Group: many payments to one invoice',
    'Invoice number + amount only',
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
            variant="default"
            className="shadow-md hover:shadow-lg"
          >
            <Plus className="h-4 w-4" />
            New Reconciliation
          </Button>
        </Link>
      </section>

      {/* Stats Cards */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Reconciliations */}
        <div
          className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.06)]"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--app-body)]">
            Total Reconciliations
          </p>
          <p className="text-4xl font-semibold tabular-nums leading-none text-[var(--app-heading)]" style={headingStyle}>
            {statsLoading ? '…' : formatNumber(stats.total)}
          </p>
        </div>

        {/* Average Match Rate */}
        <div
          className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.06)]"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--app-body)]">
            Average Match Rate
          </p>
          <div className="flex items-center gap-4">
            <p className="text-4xl font-semibold tabular-nums leading-none text-[var(--app-heading)]" style={headingStyle}>
              {statsLoading ? '…' : matchRatePct != null ? `${matchRatePct}%` : '—'}
            </p>
            {matchRatePct != null && matchRatePct >= 80 && (
              <div className="flex items-center gap-1 text-sm font-medium text-emerald-600">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Strong</span>
              </div>
            )}
          </div>
          {matchRatePct != null && (
            <div className="mt-3">
              <div className="h-2 max-w-[120px] overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(matchRatePct, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Records Processed */}
        <div
          className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.06)]"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--app-body)]">
            Records Processed
          </p>
          <p className="text-4xl font-semibold tabular-nums leading-none text-[var(--app-heading)]" style={headingStyle}>
            {statsLoading ? '…' : formatNumber(stats.totalRecordsProcessed)}
          </p>
        </div>

        {/* Total Matched */}
        <div
          className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.06)]"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--app-body)]">
            Total Matched
          </p>
          <p className="text-4xl font-semibold tabular-nums leading-none text-[var(--app-heading)]" style={headingStyle}>
            {statsLoading ? '…' : formatNumber(stats.totalMatched)}
          </p>
        </div>
      </section>

      {/* AI Rule Builder — premium dark section */}
      <section>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
          <div className="absolute top-0 right-0 h-64 w-64 -translate-y-1/2 translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.1)_0%,transparent_70%)]" />
          <div className="relative space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 shrink-0 text-violet-400" />
              <h2 className="text-xl font-semibold text-white">AI Rule Builder</h2>
            </div>
            <p className="text-sm text-white/60">
              Describe your matching rules in plain English and AI will configure them for you
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="e.g. Match by amount within 1%, date within 5 days..."
                className="flex-1 min-w-[200px] cursor-pointer rounded-xl border border-white/10 bg-white/10 py-3 px-4 text-sm text-white placeholder-white/40 backdrop-blur transition-colors focus:border-violet-400/50 focus:outline-none focus:ring-1 focus:ring-violet-400/20"
                readOnly
                onClick={() => navigate('/reconciliation/new')}
              />
              <Link to="/reconciliation/new">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-violet-600"
                >
                  <Sparkles className="h-4 w-4" />
                  Create Rules
                </button>
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="shrink-0 text-xs text-white/50">Try:</span>
              {aiSuggestions.map((suggestion) => (
                <Link key={suggestion} to="/reconciliation/new">
                  <button
                    type="button"
                    className="cursor-pointer rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/15 hover:text-white"
                  >
                    {suggestion}
                  </button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Recent Reconciliations */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--app-heading)]">
            Recent Reconciliations
          </h2>
          <Link
            to="/history"
            className="text-sm text-[var(--app-primary)] hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
          {recentLoading ? (
            <div className="space-y-4 p-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : recentRows.length === 0 ? (
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 bg-slate-50/80">
                  <TableHead className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Sources
                  </TableHead>
                  <TableHead className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Date
                  </TableHead>
                  <TableHead className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    Records
                  </TableHead>
                  <TableHead className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    Match Rate
                  </TableHead>
                  <TableHead className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
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
                    <TableCell className="px-5 py-4 text-sm font-medium text-[var(--app-heading)]">
                      {r.source_a_name} vs {r.source_b_name}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-sm text-[var(--app-body)]">
                      {formatRecDate(r.created_at)}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-right text-sm tabular-nums text-[var(--app-body)]">
                      {formatNumber(r.source_a_rows + r.source_b_rows)}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-right">
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
                        <Check className="h-3.5 w-3.5" />
                        {Math.round(r.match_rate <= 1 ? r.match_rate * 100 : r.match_rate)}%
                      </span>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        Complete
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
