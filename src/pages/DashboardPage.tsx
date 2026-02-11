import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  FileText,
  Target,
  Brain,
  Bookmark,
  UploadCloud,
  Sliders,
  Sparkles,
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
import { getCustomTemplates } from '@/features/matching-rules/templates';
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

  const tips = useMemo(
    () => [
      {
        title: 'Upload Your Data',
        description:
          'Support for CSV and Excel files. Upload up to 4 files and select which pair to reconcile.',
        icon: UploadCloud,
      },
      {
        title: 'Configure Rules',
        description:
          'Set matching rules with flexible tolerances. Save templates for recurring reconciliations.',
        icon: Sliders,
      },
      {
        title: 'AI-Powered Analysis',
        description:
          'Our AI analyzes unmatched transactions and suggests probable matches with explanations.',
        icon: Sparkles,
      },
    ],
    []
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

      {/* Getting Started */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--app-heading)]" style={headingStyle}>
          Getting Started
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {tips.map(({ title, description, icon: Icon }) => (
            <Card
              key={title}
              className="transition-shadow hover:shadow-md border-[var(--app-border)] bg-white"
            >
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--app-primary)]/10 text-[var(--app-primary)]">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base" style={headingStyle}>
                  {title}
                </CardTitle>
                <CardDescription className="text-[var(--app-body)]">
                  {description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
