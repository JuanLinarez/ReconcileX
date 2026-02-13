import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
            <Table style={{ minWidth: '600px' }}>
              <TableHeader>
                <TableRow>
                  {headersA.map((h) => (
                    <TableHead key={h} className="whitespace-nowrap">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsA.map((row, i) => (
                  <TableRow key={i}>
                    {headersA.map((h) => (
                      <TableCell key={h} className="max-w-[200px] truncate">
                        {row[h] ?? ''}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            <Table style={{ minWidth: '600px' }}>
              <TableHeader>
                <TableRow>
                  {headersB.map((h) => (
                    <TableHead key={h} className="whitespace-nowrap">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsB.map((row, i) => (
                  <TableRow key={i}>
                    {headersB.map((h) => (
                      <TableCell key={h} className="max-w-[200px] truncate">
                        {row[h] ?? ''}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
