import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ColumnMapping } from '@/features/reconciliation/types';
import type { ParsedCsv } from '@/features/reconciliation/types';

export interface ColumnMappingPageProps {
  sourceA: ParsedCsv | null;
  sourceB: ParsedCsv | null;
  mappingA: ColumnMapping;
  mappingB: ColumnMapping;
  onMappingAChange: (m: ColumnMapping) => void;
  onMappingBChange: (m: ColumnMapping) => void;
  className?: string;
}

const FIELDS = ['amount', 'date', 'reference'] as const;

function MappingRow({
  label,
  headers,
  value,
  onChange,
}: {
  label: string;
  headers: string[];
  value: string;
  onChange: (col: string) => void;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 items-center">
      <Label className="text-right">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select column" />
        </SelectTrigger>
        <SelectContent>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ColumnMappingPage({
  sourceA,
  sourceB,
  mappingA,
  mappingB,
  onMappingAChange,
  onMappingBChange,
  className,
}: ColumnMappingPageProps) {
  const headersA = sourceA?.headers ?? [];
  const headersB = sourceB?.headers ?? [];

  return (
    <div className={className}>
      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Source A — Column mapping</CardTitle>
            <CardDescription>Map CSV columns to amount, date, and reference.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {FIELDS.map((field) => (
              <MappingRow
                key={field}
                label={field.charAt(0).toUpperCase() + field.slice(1)}
                headers={headersA}
                value={mappingA[field]}
                onChange={(col) => onMappingAChange({ ...mappingA, [field]: col })}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Source B — Column mapping</CardTitle>
            <CardDescription>Map CSV columns to amount, date, and reference.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {FIELDS.map((field) => (
              <MappingRow
                key={field}
                label={field.charAt(0).toUpperCase() + field.slice(1)}
                headers={headersB}
                value={mappingB[field]}
                onChange={(col) => onMappingBChange({ ...mappingB, [field]: col })}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
