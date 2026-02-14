import { useState, useEffect } from 'react';
import { NavLink, Link, useLocation, Outlet } from 'react-router-dom';
import reconcilexLogo from '@/assets/reconcilex-logo-sidebar-notext.png';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import {
  Home,
  PlusCircle,
  Clock,
  Bookmark,
  Shield,
  Settings,
  Menu,
  X,
  Bell,
  Sparkles,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/features/onboarding/useOnboarding';
import { OnboardingChecklist } from '@/features/onboarding/OnboardingChecklist';
import {
  getReconciliationStats,
  getTemplates,
} from '@/lib/database';

function getInitials(user: { user_metadata?: { full_name?: string }; email?: string | null }): string {
  const name = user.user_metadata?.full_name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  const email = user.email ?? '';
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

const SIDEBAR_WIDTH = 256;

const navItems = [
  { to: '/', label: 'Dashboard', icon: Home, badge: undefined as number | undefined },
  { to: '/reconciliation/new', label: 'New Reconciliation', icon: PlusCircle, badge: undefined },
  { to: '/history', label: 'History', icon: Clock, badge: undefined },
  { to: '/templates', label: 'Templates', icon: Bookmark, badge: undefined },
  { to: '/security', label: 'Security', icon: Shield, badge: undefined },
  { to: '/settings', label: 'Settings', icon: Settings, badge: undefined },
] as const;

function breadcrumbFromPath(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  if (pathname.startsWith('/reconciliation/new')) return 'New Reconciliation';
  if (pathname === '/history') return 'History';
  if (pathname === '/templates') return 'Templates';
  if (pathname === '/security') return 'Security';
  if (pathname === '/settings') return 'Settings';
  return 'Dashboard';
}

export function AppLayout() {
  const { user, signOut, organizationId } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const breadcrumb = breadcrumbFromPath(location.pathname);
  const displayName = user?.user_metadata?.full_name?.trim() || user?.email || 'User';
  const initials = user ? getInitials(user) : '?';

  const [onboardingContext, setOnboardingContext] = useState({
    reconciliationCount: 0,
    templateCount: 0,
    hasRunAIAnalysis: typeof window !== 'undefined' && localStorage.getItem('rx_has_run_ai_analysis') === 'true',
    hasExportedResults: typeof window !== 'undefined' && localStorage.getItem('rx_has_exported_results') === 'true',
  });

  useEffect(() => {
    if (!organizationId) return;
    const load = () => {
      Promise.all([
        getReconciliationStats(organizationId),
        getTemplates(organizationId),
      ]).then(([stats, templates]) => {
        setOnboardingContext((prev) => ({
          ...prev,
          reconciliationCount: stats.total_reconciliations,
          templateCount: templates.length,
          hasRunAIAnalysis: localStorage.getItem('rx_has_run_ai_analysis') === 'true',
          hasExportedResults: localStorage.getItem('rx_has_exported_results') === 'true',
        }));
      });
    };
    load();
    const handler = () => load();
    window.addEventListener('rx-onboarding-update', handler);
    return () => window.removeEventListener('rx-onboarding-update', handler);
  }, [organizationId]);

  const {
    activeStep,
    completedStepIds,
    progress,
    hideOnboarding,
    isVisible,
  } = useOnboarding(onboardingContext);

  return (
    <div className="min-h-screen bg-[var(--app-bg-shell)] p-3">
      <div className="flex min-h-[calc(100vh-1.5rem)] gap-3">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar: floating on mobile (overlay), flex child on desktop */}
        <aside
          className={cn(
            'flex w-64 shrink-0 flex-col overflow-hidden rounded-2xl bg-[var(--app-sidebar)] transition-transform duration-200 ease-out',
            'fixed inset-y-3 left-3 z-50 lg:static lg:inset-auto lg:z-auto',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          )}
          style={{ width: SIDEBAR_WIDTH, minHeight: 'calc(100vh - 1.5rem)' }}
        >
          {/* Sidebar header: logo */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10">
            <NavLink to="/" onClick={() => setSidebarOpen(false)} className="flex-1 min-w-0">
              <div className="flex flex-col items-center px-3 pt-6 pb-4 mb-8">
                <img
                  src={reconcilexLogo}
                  alt="ReconcileX"
                  className="h-8 w-auto"
                />
                <span className="text-[9px] font-body tracking-[0.2em] text-white/60 uppercase mt-0.5 whitespace-nowrap">
                  AI Reconciliation Platform
                </span>
              </div>
            </NavLink>
            <button
              type="button"
              aria-label="Close menu"
              className="rounded-md p-1.5 text-[var(--app-sidebar-text)] transition-colors hover:bg-[var(--app-sidebar-item-hover)] hover:text-white lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
            {navItems.map(({ to, label, icon: Icon, badge }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150',
                    isActive
                      ? 'bg-white/15 text-white font-medium opacity-100 [&_svg]:opacity-100'
                      : 'text-white/70 hover:text-white/90 hover:bg-white/8 [&_svg]:opacity-70'
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {badge != null && badge > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Footer: user + logout */}
          <div className="shrink-0 space-y-2 border-t border-white/10 p-3">
            {user && (
              <div className="rounded-lg px-3 py-2">
                <p className="truncate text-sm font-medium text-white/80">
                  {displayName}
                </p>
                {user.email && (
                  <p className="truncate text-xs text-white/50">
                    {user.email}
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => signOut()}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/50 transition-colors hover:text-white/80 hover:bg-white/8"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              Sign Out
            </button>
            <div className="flex items-center gap-2 rounded-md px-2 py-1">
              <Sparkles className="h-4 w-4 text-white/50 shrink-0" />
              <span className="text-xs text-white/50">AI Powered</span>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-[var(--app-bg)]">
          {/* Top header */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Open menu"
                className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <span
                className="text-sm font-semibold text-[var(--app-heading)]"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {breadcrumb}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/settings"
                aria-label="Settings"
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <Settings className="h-5 w-5" />
              </Link>
              <button
                type="button"
                aria-label="Notifications"
                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <Bell className="h-5 w-5" />
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1E3A5F] text-sm font-medium text-white ring-2 ring-[#2563EB] ring-offset-2 ring-offset-white">
                {initials}
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto p-8">
            <div
              key={location.pathname}
              className="mx-auto max-w-[1200px] animate-in fade-in-0 duration-200"
            >
              {location.pathname !== '/' && <Breadcrumbs />}
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {isVisible && (
        <OnboardingChecklist
          completedStepIds={completedStepIds}
          activeStepId={activeStep?.id ?? null}
          progress={progress}
          onHideOnboarding={hideOnboarding}
        />
      )}
    </div>
  );
}
