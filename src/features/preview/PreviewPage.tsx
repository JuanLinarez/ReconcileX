import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import type { ParsedCsv } from '@/features/reconciliation/types';

export interface PreviewPageProps {
  sourceA: ParsedCsv | null;
  sourceB: ParsedCsv | null;
  maxRows?: number;
  className?: string;
}

const MAX_PREVIEW = 50;

export function PreviewPage({
  sourceA,
  sourceB,
  maxRows = MAX_PREVIEW,
  className,
}: PreviewPageProps) {
  const rowsA = sourceA?.rows.slice(0, maxRows) ?? [];
  const rowsB = sourceB?.rows.slice(0, maxRows) ?? [];
  const headersA = sourceA?.headers ?? [];
  const headersB = sourceB?.headers ?? [];

  return (
    <div className={className}>
      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Source A</CardTitle>
            <p className="text-sm text-muted-foreground">
              {sourceA?.rows.length ?? 0} rows
              {sourceA && sourceA.rows.length > maxRows && ` (showing first ${maxRows})`}
            </p>
          </CardHeader>
          <div className="border-t border-border" style={{ height: '300px', overflow: 'auto' }}>
            <table className="text-sm" style={{ minWidth: '900px' }}>
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b">
                  {headersA.map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium text-[var(--app-heading)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsA.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    {headersA.map((h) => (
                      <td key={h} className="px-3 py-2 whitespace-nowrap text-[var(--app-body)]">
                        {row[h] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Source B</CardTitle>
            <p className="text-sm text-muted-foreground">
              {sourceB?.rows.length ?? 0} rows
              {sourceB && sourceB.rows.length > maxRows && ` (showing first ${maxRows})`}
            </p>
          </CardHeader>
          <div className="border-t border-border" style={{ height: '300px', overflow: 'auto' }}>
            <table className="text-sm" style={{ minWidth: '900px' }}>
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b">
                  {headersB.map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium text-[var(--app-heading)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsB.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    {headersB.map((h) => (
                      <td key={h} className="px-3 py-2 whitespace-nowrap text-[var(--app-body)]">
                        {row[h] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
