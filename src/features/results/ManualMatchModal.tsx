import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Transaction } from '@/features/reconciliation/types';

function formatDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function formatAmount(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface ManualMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The transaction from the current source (A or B) to match. */
  sourceTransaction: Transaction;
  /** Unmatched transactions from the OTHER source. */
  otherUnmatched: Transaction[];
  /** IDs already in a manual match (exclude from list). */
  excludeIds: Set<string>;
  onConfirm: (selected: Transaction[], note: string) => void;
}

export function ManualMatchModal({
  open,
  onOpenChange,
  sourceTransaction,
  otherUnmatched,
  excludeIds,
  onConfirm,
}: ManualMatchModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  const available = useMemo(
    () => otherUnmatched.filter((t) => !excludeIds.has(t.id)),
    [otherUnmatched, excludeIds]
  );

  const searchLower = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!searchLower) return available;
    return available.filter((t) => {
      const amountStr = formatAmount(t.amount).toLowerCase();
      const dateStr = formatDate(t.date).toLowerCase();
      const ref = (t.reference ?? '').toLowerCase();
      const rawStr = Object.values(t.raw).join(' ').toLowerCase();
      return (
        amountStr.includes(searchLower) ||
        dateStr.includes(searchLower) ||
        ref.includes(searchLower) ||
        rawStr.includes(searchLower)
      );
    });
  }, [available, searchLower]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = available.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;
    onConfirm(selected, note.trim());
    setSearch('');
    setSelectedIds(new Set());
    setNote('');
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch('');
      setSelectedIds(new Set());
      setNote('');
    }
    onOpenChange(next);
  };

  const selected = available.filter((t) => selectedIds.has(t.id));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manual match</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-hidden flex flex-col min-h-0">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium mb-1">Selected transaction to match</p>
            <p>
              Row {sourceTransaction.rowIndex} · {formatAmount(sourceTransaction.amount)} ·{' '}
              {formatDate(sourceTransaction.date)} · {sourceTransaction.reference}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Search other source</label>
            <Input
              placeholder="Search by amount, date, reference, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2"
            />
          </div>

          <div className="flex-1 min-h-0 overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Row</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => toggleSelected(t.id)}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.id)}
                        onChange={() => toggleSelected(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-input"
                      />
                    </TableCell>
                    <TableCell>{t.rowIndex}</TableCell>
                    <TableCell>{formatAmount(t.amount)}</TableCell>
                    <TableCell>{formatDate(t.date)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{t.reference}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length === 0 && (
              <p className="py-4 text-center text-muted-foreground text-sm">
                No transactions to show. Try a different search or ensure the other source has unmatched items.
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Note (optional)</label>
            <Input
              placeholder="Why is this a manual match?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selected.length === 0}>
            Confirm match {selected.length > 0 ? `(${selected.length} selected)` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
