import { useCallback, useRef, useState } from 'react';
import { Upload, X, Plus, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { parseSourceFile } from '@/features/reconciliation/utils/parseCsv';
import type { ParsedCsv, UploadSlot } from '@/features/reconciliation/types';

const ACCEPT_FILES = '.csv,.xlsx,.xls';
const DEFAULT_LABELS = ['Source A', 'Source B', 'Source C', 'Source D'];

function fileTypeLabel(fileType?: ParsedCsv['fileType']): string {
  if (fileType === 'excel') return 'Excel';
  if (fileType === 'csv') return 'CSV';
  return '';
}

function createSlot(id: string, label: string): UploadSlot {
  return { id, label, parsed: null };
}

export interface UploadPageProps {
  slots: UploadSlot[];
  onSlotsChange: (slots: UploadSlot[]) => void;
  pairIndices: [number, number];
  onPairChange: (indices: [number, number]) => void;
  className?: string;
}

export function UploadPage({
  slots,
  onSlotsChange,
  pairIndices,
  onPairChange,
  className,
}: UploadPageProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState<Set<number>>(new Set());

  const handleFile = useCallback(
    async (file: File | null, slotIndex: number) => {
      if (!file) return;
      setParseError(null);
      setLoadingSlots(prev => new Set(prev).add(slotIndex));
      await new Promise(resolve => setTimeout(resolve, 50));
      try {
        const result = await parseSourceFile(file, 'sourceA');
        if (!result.success) {
          setParseError(result.error);
          return;
        }
        const next = slots.map((s, i) =>
          i === slotIndex ? { ...s, parsed: result.data } : s
        );
        onSlotsChange(next);
      } finally {
        setLoadingSlots(prev => {
          const next = new Set(prev);
          next.delete(slotIndex);
          return next;
        });
      }
    },
    [slots, onSlotsChange]
  );

  const handleInputChange = useCallback(
    (slotIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      void handleFile(file ?? null, slotIndex);
      e.target.value = '';
    },
    [handleFile]
  );

  const removeFile = useCallback(
    (slotIndex: number) => {
      const next = slots.map((s, i) =>
        i === slotIndex ? { ...s, parsed: null } : s
      );
      onSlotsChange(next);
    },
    [slots, onSlotsChange]
  );

  const setLabel = useCallback(
    (slotIndex: number, label: string) => {
      const next = slots.map((s, i) =>
        i === slotIndex ? { ...s, label: label.trim() || s.label } : s
      );
      onSlotsChange(next);
    },
    [slots, onSlotsChange]
  );

  const addSlot = useCallback(() => {
    if (slots.length >= 4) return;
    const nextId = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const label = DEFAULT_LABELS[slots.length] ?? `Source ${slots.length + 1}`;
    onSlotsChange([...slots, createSlot(nextId, label)]);
  }, [slots, onSlotsChange]);

  const removeSlot = useCallback(
    (slotIndex: number) => {
      if (slots.length <= 2) return;
      const next = slots.filter((_, i) => i !== slotIndex);
      onSlotsChange(next);
      const [a, b] = pairIndices;
      let newA = a;
      let newB = b;
      if (a === slotIndex || b === slotIndex) {
        newA = 0;
        newB = Math.min(1, next.length - 1);
      } else {
        if (a > slotIndex) newA = a - 1;
        if (b > slotIndex) newB = b - 1;
      }
      onPairChange([newA, newB]);
    },
    [slots, pairIndices, onSlotsChange, onPairChange]
  );

  const uploadedCount = slots.filter((s) => s.parsed).length;
  const canSelectPair = uploadedCount >= 2;
  const compareOptions = slots
    .map((s, i) => ({ index: i, label: s.label, parsed: s.parsed }))
    .filter((x): x is { index: number; label: string; parsed: NonNullable<UploadSlot['parsed']> } => x.parsed != null);
  const againstOptions = compareOptions.filter(
    (x) => x.index !== pairIndices[0]
  );
  const selectedFirst = slots[pairIndices[0]];
  const selectedSecond = slots[pairIndices[1]];
  const pairValid =
    selectedFirst?.parsed &&
    selectedSecond?.parsed &&
    pairIndices[0] !== pairIndices[1];

  const displayFileName = (parsed: NonNullable<UploadSlot['parsed']>) =>
    `${parsed.filename ?? 'File'} (${parsed.rows.length} rows)`;

  return (
    <div className={cn('space-y-8', className)}>
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold font-heading text-[var(--app-heading)] mb-8">
          Select your data sources
        </h1>
        <p className="text-base text-[var(--app-body)] mt-1 font-body">
          Upload up to 4 files (CSV or Excel), then choose which pair to reconcile.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 max-w-4xl mx-auto">
        {slots.map((slot, index) => (
          <Card key={slot.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Input
                  value={slot.label}
                  onChange={(e) => setLabel(index, e.target.value)}
                  className="h-8 font-medium font-heading text-base border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  placeholder={DEFAULT_LABELS[index]}
                />
                <div className="flex items-center gap-1">
                  {slot.parsed && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFile(index)}
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  {slots.length > 2 && index >= 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => removeSlot(index)}
                      aria-label="Remove slot"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="file"
                accept={ACCEPT_FILES}
                className="hidden"
                onChange={(e) => handleInputChange(index, e)}
              />
              {loadingSlots.has(index) ? (
                <div className="flex items-center justify-center gap-3 py-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--app-primary)] border-t-transparent" />
                  <span className="text-sm font-medium text-[var(--app-body)]">
                    Parsing file...
                  </span>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => inputRefs.current[index]?.click()}
                >
                  <Upload className="size-4 mr-2" />
                  Choose file (CSV or Excel)
                </Button>
              )}
              {slot.parsed && (
                <>
                  <p
                    className="text-sm text-muted-foreground truncate"
                    title={slot.parsed.filename}
                  >
                    {slot.parsed.filename}
                    {slot.parsed.fileType && (
                      <span className="ml-1">
                        ({fileTypeLabel(slot.parsed.fileType)})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {slot.parsed.rows.length} rows
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {slots.length < 4 && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={addSlot}>
            <Plus className="size-4 mr-2" />
            Add another file
          </Button>
        </div>
      )}

      {parseError && (
        <p className="text-center text-sm text-destructive">{parseError}</p>
      )}

      {canSelectPair && (
        <div className="space-y-4 rounded-lg border border-[var(--app-border)] bg-white p-6 max-w-2xl mx-auto">
          <h2 className="text-sm font-semibold text-[var(--app-heading)] font-heading">
            Select pair to reconcile
          </h2>
          <p className="text-sm text-muted-foreground font-body">
            Choose which two files to compare. You can run additional comparisons later with different pairs.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={String(pairIndices[0])}
              onValueChange={(v) => {
                const i = Number(v);
                if (pairIndices[1] === i) onPairChange([i, pairIndices[0]]);
                else onPairChange([i, pairIndices[1]]);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Compare" />
              </SelectTrigger>
              <SelectContent>
                {compareOptions.map(({ index, parsed }) => (
                  <SelectItem key={index} value={String(index)}>
                    {displayFileName(parsed)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground font-medium">↔</span>
            <Select
              value={String(pairIndices[1])}
              onValueChange={(v) => onPairChange([pairIndices[0], Number(v)])}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Against" />
              </SelectTrigger>
              <SelectContent>
                {againstOptions.map(({ index, parsed }) => (
                  <SelectItem key={index} value={String(index)}>
                    {displayFileName(parsed)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {pairValid && selectedFirst && selectedSecond && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--app-bg-subtle)] p-4 border border-[var(--app-border)]">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-[var(--app-primary)]" />
                <Input
                  value={selectedFirst.label}
                  onChange={(e) => setLabel(pairIndices[0], e.target.value)}
                  className="h-8 flex-1 min-w-0 font-medium border-0 bg-transparent shadow-none focus-visible:ring-1"
                  placeholder="Label (e.g. AP Invoices)"
                />
                <span className="text-sm text-muted-foreground shrink-0">
                  ({selectedFirst.parsed!.rows.length} rows)
                </span>
              </div>
              <span className="text-muted-foreground font-medium shrink-0">↔</span>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-[var(--app-primary)]" />
                <Input
                  value={selectedSecond.label}
                  onChange={(e) => setLabel(pairIndices[1], e.target.value)}
                  className="h-8 flex-1 min-w-0 font-medium border-0 bg-transparent shadow-none focus-visible:ring-1"
                  placeholder="Label (e.g. Bank Statement)"
                />
                <span className="text-sm text-muted-foreground shrink-0">
                  ({selectedSecond.parsed!.rows.length} rows)
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
