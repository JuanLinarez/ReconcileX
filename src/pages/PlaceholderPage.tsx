interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h1 className="text-xl font-semibold text-[var(--app-heading)]" style={{ fontFamily: 'var(--font-heading)' }}>
        {title}
      </h1>
      <p className="mt-2 text-[var(--app-body)]">Coming soon.</p>
    </div>
  );
}
