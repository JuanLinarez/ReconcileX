/**
 * ReconcileX — shared types for reconciliation flow.
 * All entities aligned with ARCHITECTURE.md.
 */

export type DataSource = 'sourceA' | 'sourceB';

/** Raw row from CSV (before column mapping). */
export type RawCsvRow = Record<string, string>;

/** Normalized transaction after column mapping. */
export interface Transaction {
  id: string;
  source: DataSource;
  amount: number;
  date: Date;
  reference: string;
  /** Original row index for display. */
  rowIndex: number;
  /** All original columns for preview. */
  raw: RawCsvRow;
}

/** Which CSV column maps to amount, date, reference (derived from rules for display). */
export interface ColumnMapping {
  amount: string;
  date: string;
  reference: string;
}

/** How many transactions on each side can form a match. */
export type MatchingType = 'oneToOne' | 'group';

/** How to compare two column values in a rule. */
export type MatchType =
  | 'exact'
  | 'tolerance_numeric'
  | 'tolerance_date'
  | 'similar_text'
  | 'contains';

/** For tolerance_numeric: fixed = ± dollar amount; percentage = ± % of larger value. */
export type ToleranceNumericMode = 'fixed' | 'percentage';

/** A single matching rule: column A vs column B with type and optional tolerance. */
export interface MatchingRule {
  id: string;
  columnA: string;
  columnB: string;
  matchType: MatchType;
  /** For tolerance_numeric: fixed = dollar amount (e.g. 25); percentage = 0–0.1 (e.g. 0.005 = 0.5%). For tolerance_date: ± days (e.g. 3). */
  toleranceValue?: number;
  /** For tolerance_numeric only: whether tolerance is fixed amount or percentage. Default percentage. */
  toleranceNumericMode?: ToleranceNumericMode;
  /** For similar_text: minimum similarity 0–1 (default 0.8). Stored as 0–1, displayed as %. */
  similarityThreshold?: number;
  /** Weight (importance) for scoring; default 1. */
  weight: number;
  /** True when rule was auto-suggested; show "Suggested" badge. */
  suggested?: boolean;
  /** True when rule was boosted by learned patterns; show "Learned" badge. */
  learned?: boolean;
  /** True when rule was generated from natural language; show "AI Generated" badge. */
  nlGenerated?: boolean;
}

/** Full matching config: rules + threshold + matching type. */
export interface MatchingConfig {
  /** At least one rule required. */
  rules: MatchingRule[];
  /** Minimum score 0–1 to consider a pair matched. */
  minConfidenceThreshold: number;
  /** Reconciliation matching type: 1:1 only, or Group (1:Many / Many:1). */
  matchingType: MatchingType;
}

/** A match: one or more from A and one or more from B, with score. 1:1 has length 1 on each side. */
export interface MatchResult {
  transactionsA: Transaction[];
  transactionsB: Transaction[];
  confidence: number;
}

/** Full result of a reconciliation run. */
export interface ReconciliationResult {
  matched: MatchResult[];
  unmatchedA: Transaction[];
  unmatchedB: Transaction[];
  config: MatchingConfig;
}

/** Uploaded file type for display. */
export type UploadedFileType = 'csv' | 'excel';

/** Parsed CSV/Excel with headers and rows. Same shape regardless of file type. */
export interface ParsedCsv {
  headers: string[];
  rows: RawCsvRow[];
  source: DataSource;
  /** Original filename. */
  filename?: string;
  /** Source format (CSV or Excel). */
  fileType?: UploadedFileType;
}

/** A single upload slot (label + optional parsed file). Used when supporting 2–4 files. */
export interface UploadSlot {
  id: string;
  label: string;
  parsed: ParsedCsv | null;
}
