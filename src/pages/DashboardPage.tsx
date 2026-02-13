import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  FileText,
  Target,
  Brain,
  Bookmark,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getCustomTemplates } from '@/features/matching-rules/templates';
import {
  getReconciliationStats,
  getReconciliations,
  getReconciliationsByPeriod,
  getMatchRateDistribution,
  getTopSourcePairs,
  getAiAnalysesByPeriod,
} from '@/lib/database';
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

export function DashboardPage() {
  const { user, organizationId } = useAuth();
  const templateCount = useMemo(() => getCustomTemplates().length, []);
  const displayName = getDisplayFirstName(user);

  const [stats, setStats] = useState<{
    total: number;
    avgMatchRate: number | null;
    aiAnalyses: number;
  }>({ total: 0, avgMatchRate: null, aiAnalyses: 0 });
  const [recentRows, setRecentRows] = useState<ReconciliationRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(true);

  const [recsByPeriod, setRecsByPeriod] = useState<Array<{ date: string; count: number; avgMatchRate: number }>>([]);
  const [matchRateDist, setMatchRateDist] = useState<Array<{ range: string; count: number }>>([]);
  const [topSourcePairs, setTopSourcePairs] = useState<Array<{ pair: string; count: number; avgMatchRate: number }>>([]);
  const [aiByPeriod, setAiByPeriod] = useState<Array<{ date: string; count: number }>>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      setStats({ total: 0, avgMatchRate: null, aiAnalyses: 0 });
      setStatsLoading(false);
      return;
    }
    setStatsLoading(true);
    getReconciliationStats(organizationId)
      .then((s) => setStats({
        total: s.total_reconciliations,
        avgMatchRate: s.average_match_rate,
        aiAnalyses: s.total_ai_analyses,
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
      .then((rows) => setRecentRows(rows.slice(0, 5)))
      .finally(() => setRecentLoading(false));
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) {
      setRecsByPeriod([]);
      setMatchRateDist([]);
      setTopSourcePairs([]);
      setAiByPeriod([]);
      setAnalyticsLoading(false);
      return;
    }
    setAnalyticsLoading(true);
    Promise.all([
      getReconciliationsByPeriod(organizationId),
      getMatchRateDistribution(organizationId),
      getTopSourcePairs(organizationId),
      getAiAnalysesByPeriod(organizationId),
    ])
      .then(([byPeriod, dist, pairs, ai]) => {
        setRecsByPeriod(byPeriod);
        setMatchRateDist(dist);
        setTopSourcePairs(pairs);
        setAiByPeriod(ai);
      })
      .finally(() => setAnalyticsLoading(false));
  }, [organizationId]);

  const statsCards = useMemo(
    () => [
      {
        label: 'Total Reconciliations',
        value: statsLoading ? '…' : String(stats.total),
        icon: FileText,
        description: 'All time',
      },
      {
        label: 'Average Match Rate',
        value: statsLoading ? '…' : stats.avgMatchRate != null ? `${Math.round(stats.avgMatchRate)}%` : '—',
        icon: Target,
        description: 'Across runs',
      },
      {
        label: 'AI Analyses',
        value: statsLoading ? '…' : String(stats.aiAnalyses),
        icon: Brain,
        description: 'Exception analyses',
      },
      {
        label: 'Saved Templates',
        value: String(templateCount),
        icon: Bookmark,
        description: 'Custom rule templates',
      },
    ],
    [statsLoading, stats.total, stats.avgMatchRate, stats.aiAnalyses, templateCount]
  );

  return (
    <div className="space-y-10 pb-8">
      {/* Welcome + Quick Action */}
      <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="text-2xl font-semibold text-[var(--app-heading)] sm:text-3xl"
            style={headingStyle}
          >
            {getGreeting()}, {displayName}
          </h1>
          <p className="mt-1 text-sm text-[var(--app-body)]">{getTodayLabel()}</p>
        </div>
        <div className="shrink-0">
          <Link to="/reconciliation/new">
            <Button size="lg" className="h-11 px-6 text-base shadow-sm">
              <ClipboardList className="h-5 w-5" />
              Start New Reconciliation
            </Button>
          </Link>
          <p className="mt-2 text-sm text-[var(--app-body)]">
            Upload files and reconcile transactions with AI-powered matching
          </p>
        </div>
      </section>

      {/* Stats Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map(({ label, value, icon: Icon, description }) => (
          <Card
            key={label}
            className="transition-shadow hover:shadow-md border-[var(--app-border)] bg-white"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[var(--app-body)]" style={headingStyle}>
                {label}
              </CardTitle>
              <Icon className="h-5 w-5 text-[var(--app-body)]/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-[var(--app-heading)]" style={headingStyle}>
                {value}
              </div>
              <p className="text-xs text-[var(--app-body)]">{description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--app-heading)]" style={headingStyle}>
          Recent Activity
        </h2>
        <Card className="border-[var(--app-border)] bg-white overflow-hidden">
          {recentLoading ? (
            <CardContent className="py-10">
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
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
                No reconciliations yet. Start your first one to see activity here.
              </p>
              <Link to="/reconciliation/new" className="mt-4">
                <Button>Get Started</Button>
              </Link>
            </CardContent>
          ) : (
            <CardContent className="p-0">
              <ul className="divide-y divide-[var(--app-border)]">
                {recentRows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="font-medium text-[var(--app-heading)]">
                        {r.source_a_name} vs {r.source_b_name}
                      </p>
                      <p className="text-sm text-[var(--app-body)]">{formatRecDate(r.created_at)}</p>
                    </div>
                    <span className="text-sm font-medium text-[var(--app-body)]">
                      {Math.round(r.match_rate)}% match
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-[var(--app-border)] px-6 py-3">
                <Link to="/history">
                  <Button variant="ghost" size="sm">View all</Button>
                </Link>
              </div>
            </CardContent>
          )}
        </Card>
      </section>

      {/* Analytics */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--app-heading)]" style={headingStyle}>
          Analytics
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-[var(--app-border)] bg-white transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-base" style={headingStyle}>
                Reconciliations Over Time
              </CardTitle>
              <CardDescription className="text-[var(--app-body)]">
                Last 30 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="h-[200px] rounded bg-muted animate-pulse" />
              ) : recsByPeriod.length === 0 || recsByPeriod.every((d) => d.count === 0) ? (
                <div className="flex h-[200px] items-center justify-center text-sm text-[var(--app-body)]">
                  No data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={recsByPeriod}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(value) => [value ?? 0, 'Count']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#2563EB"
                      fill="#2563EB"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-[var(--app-border)] bg-white transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-base" style={headingStyle}>
                Match Rate Distribution
              </CardTitle>
              <CardDescription className="text-[var(--app-body)]">
                Reconciliations by match rate
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="h-[200px] rounded bg-muted animate-pulse" />
              ) : matchRateDist.every((d) => d.count === 0) ? (
                <div className="flex h-[200px] items-center justify-center text-sm text-[var(--app-body)]">
                  No data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={matchRateDist} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {matchRateDist.map((_, i) => (
                        <Cell key={i} fill={['#E11D48', '#D97706', '#F59E0B', '#059669'][i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-[var(--app-border)] bg-white transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-base" style={headingStyle}>
                AI Usage
              </CardTitle>
              <CardDescription className="text-[var(--app-body)]">
                Exception analyses and estimated cost
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsLoading || statsLoading ? (
                <div className="space-y-3">
                  <div className="h-8 w-24 rounded bg-muted animate-pulse" />
                  <div className="h-6 w-32 rounded bg-muted animate-pulse" />
                  <div className="h-[100px] rounded bg-muted animate-pulse" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-2xl font-semibold text-[var(--app-heading)]" style={headingStyle}>
                    {stats.aiAnalyses}
                  </div>
                  <p className="text-xs text-[var(--app-body)]">
                    Estimated cost: ${(stats.aiAnalyses * 0.003).toFixed(2)}
                  </p>
                  {aiByPeriod.length === 0 || aiByPeriod.every((d) => d.count === 0) ? (
                    <div className="flex h-[100px] items-center justify-center text-sm text-[var(--app-body)]">
                      No data yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={100}>
                      <LineChart data={aiByPeriod}>
                        <XAxis dataKey="date" hide tickFormatter={(v) => v.slice(5)} />
                        <YAxis hide width={1} />
                        <Tooltip
                          formatter={(value) => [value ?? 0, 'AI calls']}
                          labelFormatter={(label) => `Date: ${label}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="#2563EB"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[var(--app-border)] bg-white transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-base" style={headingStyle}>
                Most Reconciled Sources
              </CardTitle>
              <CardDescription className="text-[var(--app-body)]">
                Top 5 source pairs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-10 rounded bg-muted animate-pulse" />
                  ))}
                </div>
              ) : topSourcePairs.length === 0 ? (
                <div className="flex h-[120px] items-center justify-center text-sm text-[var(--app-body)]">
                  No data yet
                </div>
              ) : (
                <ul className="space-y-3">
                  {topSourcePairs.map(({ pair, count, avgMatchRate }) => (
                    <li key={pair} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--app-heading)] truncate max-w-[200px]">
                        {pair}
                      </span>
                      <span className="text-xs text-[var(--app-body)] shrink-0 ml-2">
                        <span className="font-medium">{count}</span> runs
                        <span className="ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 bg-muted text-xs font-medium">
                          {Math.round(avgMatchRate)}% avg
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
