import { useState } from 'react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';
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

const SIDEBAR_WIDTH = 260;

const navItems = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/reconciliation/new', label: 'New Reconciliation', icon: PlusCircle },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/templates', label: 'Templates', icon: Bookmark },
  { to: '/security', label: 'Security', icon: Shield },
  { to: '/settings', label: 'Settings', icon: Settings },
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
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const breadcrumb = breadcrumbFromPath(location.pathname);
  const displayName = user?.user_metadata?.full_name?.trim() || user?.email || 'User';
  const initials = user ? getInitials(user) : '?';

  return (
    <div className="flex min-h-screen bg-[var(--app-bg)]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: dark navy #0F172A, white text/icons */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-[260px] flex-col bg-gradient-to-b from-[#0F172A] to-[#1E293B] text-white transition-transform duration-200 ease-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="flex h-14 items-center justify-between px-4 lg:justify-start">
          <NavLink to="/" className="flex items-center gap-2 font-bold text-white" onClick={() => setSidebarOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
              <span className="text-lg font-bold text-white">R</span>
            </div>
            <span className="text-lg tracking-tight text-white" style={{ fontFamily: 'var(--font-heading)' }}>ReconcileX</span>
          </NavLink>
          <button
            type="button"
            aria-label="Close menu"
            className="rounded-md p-1.5 text-white/70 hover:bg-white/5 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'border-l-2 border-[#2563EB] bg-[rgba(255,255,255,0.1)] pl-[calc(0.75rem-2px)] text-white [&_svg]:opacity-100'
                    : 'text-white/70 hover:bg-[rgba(255,255,255,0.05)] hover:text-white [&_svg]:opacity-70 hover:[&_svg]:opacity-100'
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 p-3">
          {user && (
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <p className="truncate text-xs font-medium text-white">{displayName}</p>
              {user.email && (
                <p className="truncate text-xs text-white/70">{user.email}</p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-white"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Sign Out
          </button>
          <div className="flex items-center gap-2 rounded-lg bg-[#2563EB]/20 px-3 py-2">
            <Sparkles className="h-4 w-4 text-white" />
            <span className="text-xs font-medium text-white">AI Powered</span>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[260px]">
        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-[var(--app-border)] bg-white/80 px-4 backdrop-blur-sm md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-[var(--app-heading)]" style={{ fontFamily: 'var(--font-heading)' }}>
              {breadcrumb}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Notifications"
              className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <Bell className="h-5 w-5" />
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--app-primary)] text-xs font-semibold text-white">
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div
            key={location.pathname}
            className="mx-auto max-w-[1200px] animate-in fade-in-0 duration-200"
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
