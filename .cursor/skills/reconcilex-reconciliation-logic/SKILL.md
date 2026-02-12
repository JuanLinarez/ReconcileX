---
name: reconcilex-reconciliation-logic
description: Expert in financial reconciliation logic for ReconcileX SaaS. Use when implementing matching algorithms, reconciliation rules, discrepancy reports, handling edge cases in transaction matching, or designing reconciliation workflows.
---

# ReconcileX Reconciliation Logic

Expert guide for financial reconciliation logic in ReconcileX. Apply when building or modifying matching engines, rules, discrepancy reports, or reconciliation workflows.

## Domain Overview

ReconcileX is a SaaS platform that automates reconciliation of financial transactions. Reconciliation compares two datasets (e.g., bank statement vs internal records) to find matches, discrepancies, and anomalies.

## Reconciliation Types

| Type | Source | Target |
|------|--------|--------|
| **Bank Reconciliation** | Bank statement | Ledger |
| **Intercompany** | Entity A transactions | Entity B transactions |
| **Payment Gateway** | Processed payments | Settlements received |
| **Accounts Receivable** | Invoices issued | Payments received |

## Transaction States

| State | Meaning |
|-------|---------|
| `pending` | Unprocessed |
| `matched` | Exact or within-tolerance match |
| `partial_match` | Amount differs within tolerance |
| `unmatched` | No pair found |
| `excluded` | Manually excluded |
| `disputed` | Under review |

## Matching Rules (Aligned with ReconcileX)

Rules use `columnA`/`columnB` (source/target). Match types:

- `exact` — Exact value match
- `tolerance_numeric` — Within fixed amount or percentage
- `tolerance_date` — Within ±N days
- `similar_text` — Text similarity (Levenshtein)
- `contains` — Substring match

**Critical**: Apply rules by priority (1 = highest). Never auto-approve when confidence < 85.

## Reconciliation Algorithm

### Step 1: Preparation

- Normalize data (trim, case, date/amount formats)
- Validate required fields
- Group by account/entity

### Step 2: Exact Matching (Priority 1)

Match by unique reference + exact amount when possible:

```typescript
const exactMatches = sourceA.filter(s =>
  sourceB.some(t =>
    s.reference === t.reference &&
    s.amount === t.amount &&
    (s.currency === t.currency || !currencyUsed)
  )
)
```

### Step 3: Rule-Based Matching (Priority 2+)

Apply rules in priority order. For each rule:

1. Find candidates among unmatched
2. Score each candidate with confidence
3. Auto-approve only if `confidence >= 85` and `rule.auto_approve`

### Step 4: Confidence Scoring

```typescript
// Weights (total 1.0)
const weights = {
  reference_match: 0.35,
  amount_match: 0.30,
  date_match: 0.20,
  description_match: 0.15,
}
// Return 0–100. Use minConfidenceThreshold (0–1) for cutoff.
```

### Step 5: Discrepancy Reporting

Report must include:

- `total_source`, `total_target`
- `matched`, `unmatched_source`, `unmatched_target`
- `partial_matches`, `total_amount_difference`
- Per-discrepancy: `type`, `source_transaction`, `target_transaction`, `difference`, `suggested_action`

## Performance Patterns

- Index matching fields (reference, amount, date)
- Batch processing for >10k transactions
- Save state between batches for incremental progress
- Cache evaluated rules

## Critical Edge Cases

| Case | Handling |
|------|----------|
| Duplicates on one side | Detect and flag; avoid double-matching |
| One-to-many | One payment covers multiple invoices — use `matchingType: 'group'` |
| Many-to-one | Multiple partial payments for one invoice — group matching |
| Timezone differences | Normalize dates to UTC or account timezone |
| Currency conversion | Explicit conversion with rounding rules; never ignore |
| Reversed/voided | Flag and exclude; treat as reversal pair |

## Prohibitions

- **NO** auto-approve when confidence < 85
- **NO** mutate original transactions (immutability)
- **NO** ignore currency differences
- **NO** process without input validation
- **NO** lose traceability: every match must record who/when/why

## ReconcileX Codebase Alignment

- Types: `src/features/reconciliation/types.ts`
- Engine: `src/features/reconciliation/engine/matchingEngine.ts`
- Rules UI: `src/features/matching-rules/`
- Config uses `minConfidenceThreshold` (0–1), `columnA`/`columnB`, `matchingType: 'oneToOne' | 'group'`

## Additional Resources

- For detailed interfaces, algorithms, and edge-case handling, see [reference.md](reference.md)
