import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowUp, Sparkles, X } from 'lucide-react';
import type { ReconciliationResult } from '@/features/reconciliation/types';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import type { AnomalyReport } from '@/features/anomalies/anomalyDetector';
import { cn } from '@/lib/utils';

const QUICK_ACTIONS = [
  'What are my biggest exceptions?',
  'Summarize this reconciliation',
  'Which vendors have issues?',
  'How can I improve my match rate?',
];

export interface CopilotPanelProps {
  result: ReconciliationResult;
  anomalyReport?: AnomalyReport | null;
  sourceAName: string;
  sourceBName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function formatDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return '—';
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d);
}

function buildContext(
  result: ReconciliationResult,
  sourceAName: string,
  sourceBName: string,
  anomalyReport?: AnomalyReport | null
) {
  const matchedAmount = result.matched.reduce(
    (s, m) => s + m.transactionsA.reduce((sum, t) => sum + t.amount, 0),
    0
  );
  const unmatchedAmountA = result.unmatchedA.reduce((s, t) => s + t.amount, 0);
  const unmatchedAmountB = result.unmatchedB.reduce((s, t) => s + t.amount, 0);
  const totalRows = result.matched.reduce(
    (s, m) => s + m.transactionsA.length + m.transactionsB.length,
    0
  ) + result.unmatchedA.length + result.unmatchedB.length;
  const matchRate = totalRows > 0 ? (result.matched.length * 2) / totalRows : 0;

  const topUnmatchedA = result.unmatchedA.slice(0, 10).map((t) => ({
    rowIndex: t.rowIndex,
    amount: t.amount,
    date: formatDate(t.date),
    reference: t.reference,
    raw: t.raw ?? {},
  }));
  const topUnmatchedB = result.unmatchedB.slice(0, 10).map((t) => ({
    rowIndex: t.rowIndex,
    amount: t.amount,
    date: formatDate(t.date),
    reference: t.reference,
    raw: t.raw ?? {},
  }));
  const topMatched = result.matched.slice(0, 10).map((m) => {
    const amtA = m.transactionsA.reduce((s, t) => s + t.amount, 0);
    const amtB = m.transactionsB.reduce((s, t) => s + t.amount, 0);
    const refA = m.transactionsA.map((t) => t.reference).join('; ');
    const refB = m.transactionsB.map((t) => t.reference).join('; ');
    return { confidence: m.confidence, amountA: amtA, amountB: amtB, referenceA: refA, referenceB: refB };
  });

  return {
    matchedCount: result.matched.length,
    unmatchedACount: result.unmatchedA.length,
    unmatchedBCount: result.unmatchedB.length,
    matchRate,
    matchedAmount,
    unmatchedAmountA,
    unmatchedAmountB,
    sourceAName,
    sourceBName,
    sourceARows: result.unmatchedA.length + result.matched.reduce((s, m) => s + m.transactionsA.length, 0),
    sourceBRows: result.unmatchedB.length + result.matched.reduce((s, m) => s + m.transactionsB.length, 0),
    matchingType: result.config.matchingType === 'oneToOne' ? '1:1' : 'Group',
    rules: result.config.rules.map((r) => ({
      columnA: r.columnA,
      columnB: r.columnB,
      matchType: r.matchType,
      weight: r.weight,
    })),
    topUnmatchedA,
    topUnmatchedB,
    topMatched,
    anomalySummary: anomalyReport?.summary,
  };
}

export function CopilotPanel({
  result,
  anomalyReport,
  sourceAName,
  sourceBName,
  isOpen,
  onClose,
}: CopilotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMessages([]);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = { role: 'user', content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      const context = buildContext(result, sourceAName, sourceBName, anomalyReport);
      const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = messages.map(
        (m) => ({ role: m.role, content: m.content })
      );

      try {
        const res = await fetch('/api/copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: trimmed,
            conversationHistory,
            context,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const errMsg = typeof data?.message === 'string' ? data.message : data?.error ?? `Request failed (${res.status})`;
          throw new Error(errMsg);
        }

        const answer = data?.answer ?? '';
        setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
      } catch (err) {
        const message = getFriendlyErrorMessage(err);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `**Error:** ${message}` },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [result, sourceAName, sourceBName, anomalyReport, messages]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div
      className={cn(
        'fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col bg-white shadow-xl transition-transform duration-300 ease-out',
        'border-l border-border',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}
      style={{
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header with gradient border */}
      <div className="shrink-0 border-b border-border bg-gradient-to-r from-blue-50/80 to-purple-50/80 dark:from-blue-950/30 dark:to-purple-950/30">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-[#2563EB]" />
            <span className="font-semibold text-[var(--app-heading)]">
              ReconcileX Copilot
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 && !loading && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask questions about your reconciliation results. I have context on your data.
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendMessage(suggestion)}
                  className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-[var(--app-body)] hover:bg-muted hover:text-[var(--app-heading)] transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              'max-w-[90%] rounded-2xl px-4 py-2',
              msg.role === 'user'
                ? 'ml-auto bg-[#2563EB] text-white'
                : msg.content.startsWith('**Error:**')
                  ? 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
                  : 'bg-muted text-[var(--app-heading)]'
            )}
          >
            <p className="text-sm whitespace-pre-wrap break-words">
              {msg.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
                part.startsWith('**') && part.endsWith('**') ? (
                  <strong key={i}>{part.slice(2, -2)}</strong>
                ) : (
                  part
                )
              )}
            </p>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="flex gap-1">
              <span className="size-2 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
              <span className="size-2 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
              <span className="size-2 animate-bounce rounded-full bg-current" />
            </div>
            <span className="text-sm">Thinking...</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your reconciliation..."
            disabled={loading}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={loading || !input.trim()}
            className="shrink-0"
          >
            <ArrowUp className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
