import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, Plus, ArrowRight, X } from 'lucide-react';
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

function fileTypeLabel(fileType?: ParsedCsv['fileType'], filename?: string): string {
  if (fileType === 'excel') return 'Excel';
  if (fileType === 'csv') return 'CSV';
  if (filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'Excel';
    if (lower.endsWith('.csv')) return 'CSV';
  }
  return 'File';
}

function createSlot(id: string, label: string): UploadSlot {
  return { id, label, parsed: null };
}

export interface UploadPageProps {
  slots: UploadSlot[];
  onSlotsChange: (slots: UploadSlot[]) => void;
  pairIndices: [number, number];
  onPairChange: (indices: [number, number]) => void;
  onContinue?: () => void;
  className?: string;
}

export function UploadPage({
  slots,
  onSlotsChange,
  pairIndices,
  onPairChange,
  onContinue,
  className,
}: UploadPageProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState<Set<number>>(new Set());
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const handleFile = useCallback(
    async (file: File | null, slotIndex: number) => {
      if (!file) return;
      setParseError(null);
      setLoadingSlots((prev) => new Set(prev).add(slotIndex));
      await new Promise((resolve) => setTimeout(resolve, 50));
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
        setLoadingSlots((prev) => {
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

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingIndex(index);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDraggingIndex(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, slotIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingIndex(null);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file, slotIndex);
    },
    [handleFile]
  );

  const uploadedCount = slots.filter((s) => s.parsed).length;
  const canSelectPair = uploadedCount >= 2;
  const showPairSelector = uploadedCount > 2;

  const compareOptions = slots
    .map((s, i) => ({ index: i, label: s.label, parsed: s.parsed }))
    .filter(
      (x): x is { index: number; label: string; parsed: NonNullable<UploadSlot['parsed']> } =>
        x.parsed != null
    );
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

  // When exactly 2 files are uploaded, auto-select them as the pair
  useEffect(() => {
    if (uploadedCount !== 2) return;
    const indices = slots
      .map((s, i) => (s.parsed ? i : -1))
      .filter((i) => i >= 0);
    if (indices.length !== 2) return;
    const [a, b] = [indices[0]!, indices[1]!];
    if (pairIndices[0] !== a || pairIndices[1] !== b) {
      onPairChange([a, b]);
    }
  }, [uploadedCount, slots, pairIndices, onPairChange]);

  return (
    <div className={cn('space-y-8', className)}>
      {/* Page Title — Left-aligned */}
      <div className="mb-4">
        <h1 className="text-sm font-semibold uppercase tracking-wide text-[var(--app-heading)]">
          Select your data sources
        </h1>
        <p className="text-xs text-[var(--app-body)] mt-1">
          Upload up to 4 files (CSV or Excel), then choose which pair to reconcile.
        </p>
      </div>

      {/* Source Cards */}
      <div className="grid gap-5 sm:grid-cols-2 max-w-4xl">
        {slots.map((slot, index) => (
          <div
            key={slot.id}
            className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold uppercase tracking-wide text-[var(--app-heading)]">
                {DEFAULT_LABELS[index] ?? `Source ${index + 1}`}
              </span>
              <div className="flex items-center gap-1">
                {slot.parsed && (
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label="Remove file"
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {slots.length > 2 && index >= 2 && (
                  <button
                    type="button"
                    onClick={() => removeSlot(index)}
                    aria-label="Remove slot"
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

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
              <div className="flex items-center justify-center gap-3 py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--app-primary)] border-t-transparent" />
                <span className="text-sm font-medium text-[var(--app-body)]">
                  Parsing file...
                </span>
              </div>
            ) : slot.parsed ? (
              /* Loaded File State */
              <div className="flex items-center gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                  <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--app-heading)]">
                    {slot.parsed.filename ?? 'File'}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {slot.parsed.rows.length} rows
                    </span>
                    <span className="text-xs text-[var(--app-body)]">
                      {fileTypeLabel(slot.parsed.fileType, slot.parsed.filename)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => inputRefs.current[index]?.click()}
                  className="shrink-0 text-sm text-[var(--app-body)] underline hover:text-[var(--app-heading)] cursor-pointer"
                >
                  Replace
                </button>
              </div>
            ) : (
              /* Empty Dropzone State */
              <div
                role="button"
                tabIndex={0}
                onClick={() => inputRefs.current[index]?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    inputRefs.current[index]?.click();
                  }
                }}
                onDragEnter={(e) => handleDragOver(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-all duration-200',
                  draggingIndex === index
                    ? 'border-blue-400 bg-blue-50/30'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                )}
              >
                <UploadCloud className="h-10 w-10 text-slate-400" />
                <div className="text-center">
                  <p className="text-sm font-medium text-[var(--app-heading)]">
                    Drop {DEFAULT_LABELS[index]}
                  </p>
                  <p className="mt-1 text-xs text-[var(--app-body)]">
                    Drag & drop your CSV or Excel file here
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRefs.current[index]?.click();
                  }}
                  className="mt-1 rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-[var(--app-body)] hover:bg-slate-50 cursor-pointer"
                >
                  Browse files
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add another file */}
      {slots.length < 4 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={addSlot}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-2 border-dashed border-slate-200 px-4 py-2 text-sm font-medium text-[var(--app-body)] hover:bg-slate-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Add another file
          </button>
        </div>
      )}

      {parseError && (
        <p className="text-center text-sm text-destructive">{parseError}</p>
      )}

      {/* Pair selector — only show when more than 2 files uploaded */}
      {showPairSelector && canSelectPair && (
        <div className="max-w-2xl space-y-4 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--app-heading)]">
            Select pair to reconcile
          </h2>
          <p className="text-sm text-muted-foreground font-body">
            Choose which two files to compare. You can run additional comparisons
            later with different pairs.
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
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--app-bg-subtle)] p-4 border border-slate-200/60">
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

      {/* Continue button — sticky at bottom when files loaded */}
      {pairValid && onContinue && (
        <div className="sticky bottom-0 z-10 bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pt-6 pb-4 -mx-6 px-6 mt-4">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onContinue}
              className="flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--app-primary)] px-10 py-3 text-[15px] font-semibold text-white shadow-lg shadow-[var(--app-primary)]/20 transition-colors hover:bg-blue-700"
            >
              Continue to Matching Rules
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
