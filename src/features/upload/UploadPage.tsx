import { useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DataSource } from '@/features/reconciliation/types';
import { parseSourceFile } from '@/features/reconciliation/utils/parseCsv';
import type { ParsedCsv } from '@/features/reconciliation/types';

const ACCEPT_FILES = '.csv,.xlsx,.xls';

export interface UploadPageProps {
  onParsed: (sourceA: ParsedCsv | null, sourceB: ParsedCsv | null) => void;
  sourceA?: ParsedCsv | null;
  sourceB?: ParsedCsv | null;
  className?: string;
}

function fileTypeLabel(fileType?: ParsedCsv['fileType']): string {
  if (fileType === 'excel') return 'Excel';
  if (fileType === 'csv') return 'CSV';
  return '';
}

export function UploadPage({ onParsed, sourceA, sourceB, className }: UploadPageProps) {
  const inputARef = useRef<HTMLInputElement>(null);
  const inputBRef = useRef<HTMLInputElement>(null);
  const sourceADataRef = useRef<ParsedCsv | null>(null);
  const sourceBDataRef = useRef<ParsedCsv | null>(null);

  const handleFile = useCallback(
    async (file: File | null, source: DataSource) => {
      if (!file) return;
      const result = await parseSourceFile(file, source);
      if (!result.success) {
        alert(result.error);
        return;
      }
      if (source === 'sourceA') sourceADataRef.current = result.data;
      else sourceBDataRef.current = result.data;
      onParsed(sourceADataRef.current, sourceBDataRef.current);
    },
    [onParsed]
  );

  const handleInputA = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      void handleFile(file ?? null, 'sourceA');
      e.target.value = '';
    },
    [handleFile]
  );

  const handleInputB = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      void handleFile(file ?? null, 'sourceB');
      e.target.value = '';
    },
    [handleFile]
  );

  return (
    <div className={cn('space-y-8', className)}>
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight font-heading">Select your data sources</h1>
        <p className="text-muted-foreground font-body">
          Upload two files (CSV or Excel) to reconcile transactions.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5" />
              Source A
            </CardTitle>
            <CardDescription>Bank statement or first data source</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={inputARef}
              type="file"
              accept={ACCEPT_FILES}
              className="hidden"
              onChange={handleInputA}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => inputARef.current?.click()}
            >
              <Upload className="size-4 mr-2" />
              Choose file (CSV or Excel)
            </Button>
            {sourceA?.filename && (
              <p className="text-sm text-muted-foreground truncate" title={sourceA.filename}>
                {sourceA.filename}
                {sourceA.fileType && (
                  <span className="ml-1">({fileTypeLabel(sourceA.fileType)})</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5" />
              Source B
            </CardTitle>
            <CardDescription>ERP or second data source</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={inputBRef}
              type="file"
              accept={ACCEPT_FILES}
              className="hidden"
              onChange={handleInputB}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => inputBRef.current?.click()}
            >
              <Upload className="size-4 mr-2" />
              Choose file (CSV or Excel)
            </Button>
            {sourceB?.filename && (
              <p className="text-sm text-muted-foreground truncate" title={sourceB.filename}>
                {sourceB.filename}
                {sourceB.fileType && (
                  <span className="ml-1">({fileTypeLabel(sourceB.fileType)})</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
