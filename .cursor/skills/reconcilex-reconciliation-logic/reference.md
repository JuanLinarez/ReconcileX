# ReconcileX Reconciliation Logic — Reference

Detailed interfaces, algorithms, and edge-case handling for the main skill.

## Matching Rule Interface (Extended)

```typescript
interface MatchingRule {
  id: string
  name: string
  priority: number  // 1 = highest
  conditions: MatchCondition[]
  tolerance: {
    amount: number      // Absolute amount difference allowed
    amount_pct: number  // % difference (e.g. 0.01 = 1%)
    days: number        // Days difference allowed for dates
  }
  auto_approve: boolean  // If true, matches auto-approved when confidence >= threshold
}

interface MatchCondition {
  field_source: string   // Source dataset field
  field_target: string   // Target dataset field
  match_type: 'exact' | 'fuzzy' | 'contains' | 'amount_tolerance' | 'date_tolerance'
}
```

**ReconcileX mapping**: `field_source` → `columnA`, `field_target` → `columnB`. `match_type` maps to `exact`, `tolerance_numeric`, `tolerance_date`, `similar_text`, `contains`.

## Confidence Calculation

```typescript
const calculateConfidence = (match: CandidateMatch, rule: MatchingRule): number => {
  let score = 0
  const weights = {
    reference_match: 0.35,
    amount_match: 0.30,
    date_match: 0.20,
    description_match: 0.15,
  }

  if (match.referenceExact) score += weights.reference_match
  if (match.amountDiff <= rule.tolerance.amount) score += weights.amount_match
  if (match.daysDiff <= rule.tolerance.days) score += weights.date_match
  if (match.descriptionSimilarity > 0.8) score += weights.description_match

  return Math.round(score * 100)  // 0–100
}
```

When using ReconcileX `minConfidenceThreshold` (0–1), convert: `confidence / 100 >= minConfidenceThreshold`.

## Discrepancy Report Interfaces

```typescript
interface DiscrepancyReport {
  total_source: number
  total_target: number
  matched: number
  unmatched_source: number
  unmatched_target: number
  partial_matches: number
  total_amount_difference: number
  discrepancies: Discrepancy[]
}

interface Discrepancy {
  type: 'missing_in_target' | 'missing_in_source' | 'amount_mismatch' | 'date_mismatch'
  source_transaction?: Transaction
  target_transaction?: Transaction
  difference?: number
  suggested_action: string
}
```

## Rule-Based Matching Pseudocode

```typescript
for (const rule of sortedRules) {
  const candidates = findCandidates(unmatched, rule)
  const scored = candidates.map(c => ({
    ...c,
    confidence: calculateConfidence(c, rule)
  }))
  // Auto-approve only if confidence >= threshold AND rule.auto_approve
}
```

## Edge Cases — Detail

### Duplicates on One Side

- Detect duplicates in source or target before matching
- Option: allow only first match; flag rest as `duplicate_skip`
- Report: "Duplicate transaction detected"

### One-to-Many (1:N)

- One payment covers multiple invoices
- Use `matchingType: 'group'` in ReconcileX
- Match when sum of target amounts equals source amount

### Many-to-One (N:1)

- Multiple partial payments for one invoice
- Group matching: sum source amounts vs single target amount

### Timezone Differences

- Normalize all dates to UTC or account timezone before comparison
- Store original timezone for display

### Currency Conversion

- Always convert to same currency before comparison
- Use explicit conversion rate; document rounding rules
- Never ignore currency mismatch

### Reversed/Voided Transactions

- Identify reversal pairs (negative amount matching original)
- Exclude from main flow; treat as separate reconciliation

### Traceability

Every match must record:

- `who`: user or system
- `when`: timestamp
- `why`: rule used, confidence score
