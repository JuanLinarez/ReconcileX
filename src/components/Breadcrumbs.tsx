import { Link, useLocation } from 'react-router-dom';

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/reconciliation/new': 'New Reconciliation',
  '/history': 'History',
  '/templates': 'Templates',
  '/security': 'Security',
  '/settings': 'Settings',
};

function getBreadcrumbItems(pathname: string): Array<{ label: string; path: string; isCurrent: boolean }> {
  const items: Array<{ label: string; path: string; isCurrent: boolean }> = [
    { label: 'ReconcileX', path: '/', isCurrent: pathname === '/' },
  ];

  if (pathname === '/') {
    return items;
  }

  const segments = pathname.split('/').filter(Boolean);
  let currentPath = '';

  for (const segment of segments) {
    currentPath += `/${segment}`;
    const label = ROUTE_LABELS[currentPath] ?? segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({
      label,
      path: currentPath,
      isCurrent: currentPath === pathname,
    });
  }

  return items;
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const items = getBreadcrumbItems(pathname);

  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-[var(--app-body)]">
        {items.map((item, i) => (
          <li key={item.path} className="flex items-center gap-1">
            {i > 0 && <span className="text-[var(--app-body)]/60" aria-hidden>›</span>}
            {item.isCurrent ? (
              <span className="font-semibold text-[var(--app-heading)]">{item.label}</span>
            ) : (
              <Link
                to={item.path}
                className="hover:text-[var(--app-heading)] transition-colors"
              >
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
