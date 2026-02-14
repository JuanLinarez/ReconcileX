/**
 * Test data factory for ReconcileX transactions and matching objects.
 * Used by all test suites to generate controlled, predictable test data.
 */
import type {
  Transaction,
  MatchingRule,
  MatchingConfig,
  MatchResult,
  ReconciliationResult,
  DataSource,
  MatchingType,
} from '@/features/reconciliation/types';

let idCounter = 0;

/** Reset the counter between test suites if needed. */
export function resetIdCounter(): void {
  idCounter = 0;
}

/** Create a Transaction with sensible defaults. Override any field. */
export function createTransaction(
  overrides: Partial<Transaction> & { source?: DataSource } = {}
): Transaction {
  idCounter++;
  const id = overrides.id ?? `test-txn-${idCounter}`;
  const source = overrides.source ?? 'sourceA';
  return {
    id,
    source,
    amount: overrides.amount ?? 1000 + idCounter,
    date: overrides.date ?? new Date('2025-01-15'),
    reference: overrides.reference ?? `REF-${String(idCounter).padStart(4, '0')}`,
    rowIndex: overrides.rowIndex ?? idCounter,
    raw: overrides.raw ?? {
      Amount: String(overrides.amount ?? 1000 + idCounter),
      Date: '2025-01-15',
      Reference: overrides.reference ?? `REF-${String(idCounter).padStart(4, '0')}`,
      VendorName: `Vendor ${idCounter}`,
    },
  };
}

/** Create a matched pair: one txn from sourceA and one from sourceB that should match. */
export function createMatchingPair(overrides: {
  amount?: number;
  date?: Date;
  reference?: string;
  vendorA?: string;
  vendorB?: string;
  amountDiffB?: number;
  dateDiffDaysB?: number;
  referenceB?: string;
  confidence?: number;
} = {}): { a: Transaction; b: Transaction; expectedConfidence?: number } {
  const amount = overrides.amount ?? 1500;
  const date = overrides.date ?? new Date('2025-01-15');
  const reference = overrides.reference ?? `REF-${String(++idCounter).padStart(4, '0')}`;

  const amountB = amount + (overrides.amountDiffB ?? 0);
  const dateB = overrides.dateDiffDaysB
    ? new Date(date.getTime() + overrides.dateDiffDaysB * 86400000)
    : date;
  const referenceB = overrides.referenceB ?? reference;

  const a = createTransaction({
    source: 'sourceA',
    amount,
    date,
    reference,
    raw: {
      Amount: String(amount),
      Date: date.toISOString().slice(0, 10),
      Reference: reference,
      VendorName: overrides.vendorA ?? 'Acme Corp',
    },
  });

  const b = createTransaction({
    source: 'sourceB',
    amount: amountB,
    date: dateB,
    reference: referenceB,
    raw: {
      Amount: String(amountB),
      Date: dateB.toISOString().slice(0, 10),
      Reference: referenceB,
      VendorName: overrides.vendorB ?? 'Acme Corp',
    },
  });

  return { a, b, expectedConfidence: overrides.confidence };
}

/** Create a transaction that should NOT match anything. */
export function createUnmatchable(source: DataSource = 'sourceA'): Transaction {
  idCounter++;
  return createTransaction({
    source,
    amount: 999999.99 + idCounter,
    date: new Date('2020-01-01'),
    reference: `NOMATCH-${idCounter}-${Date.now()}`,
    raw: {
      Amount: String(999999.99 + idCounter),
      Date: '2020-01-01',
      Reference: `NOMATCH-${idCounter}-${Date.now()}`,
      VendorName: `NonExistentVendor_${idCounter}`,
    },
  });
}

/** Create a MatchingRule with defaults. */
export function createRule(overrides: Partial<MatchingRule> = {}): MatchingRule {
  return {
    id: overrides.id ?? `rule-${++idCounter}`,
    columnA: overrides.columnA ?? 'Amount',
    columnB: overrides.columnB ?? 'Amount',
    matchType: overrides.matchType ?? 'exact',
    weight: overrides.weight ?? 1.0,
    toleranceValue: overrides.toleranceValue,
    toleranceNumericMode: overrides.toleranceNumericMode,
    similarityThreshold: overrides.similarityThreshold,
    suggested: overrides.suggested,
    learned: overrides.learned,
    nlGenerated: overrides.nlGenerated,
  };
}

/** Create a MatchingConfig with defaults. */
export function createConfig(overrides: {
  rules?: MatchingRule[];
  minConfidenceThreshold?: number;
  matchingType?: MatchingType;
} = {}): MatchingConfig {
  return {
    rules: overrides.rules ?? [createRule({ weight: 1.0 })],
    minConfidenceThreshold: overrides.minConfidenceThreshold ?? 0.7,
    matchingType: overrides.matchingType ?? 'oneToOne',
  };
}

/** Create a MatchResult from pre-built transactions. */
export function createMatchResult(
  transactionsA: Transaction[],
  transactionsB: Transaction[],
  confidence: number
): MatchResult {
  return { transactionsA, transactionsB, confidence };
}

/** Create a full ReconciliationResult. */
export function createReconciliationResult(overrides: {
  matched?: MatchResult[];
  unmatchedA?: Transaction[];
  unmatchedB?: Transaction[];
  config?: MatchingConfig;
} = {}): ReconciliationResult {
  return {
    matched: overrides.matched ?? [],
    unmatchedA: overrides.unmatchedA ?? [],
    unmatchedB: overrides.unmatchedB ?? [],
    config: overrides.config ?? createConfig(),
  };
}
