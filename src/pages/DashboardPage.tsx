import { useMemo } from 'react';
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

export function DashboardPage() {
  const { user } = useAuth();
  const templateCount = useMemo(() => getCustomTemplates().length, []);
  const displayName = getDisplayFirstName(user);

  const stats = useMemo(
    () => [
      {
        label: 'Total Reconciliations',
        value: '0',
        icon: FileText,
        description: 'All time',
      },
      {
        label: 'Average Match Rate',
        value: '—',
        icon: Target,
        description: 'Across runs',
      },
      {
        label: 'AI Analyses',
        value: '0',
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
    [templateCount]
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
        {stats.map(({ label, value, icon: Icon, description }) => (
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
