# Architecture — ReconcileX

## Data Flow
1. User uploads 2 CSV files (Source A and Source B)
2. System parses and normalizes transactions to common schema
3. User configures matching rules (which columns, tolerances)
4. Matching engine applies rules and scores potential matches
5. Results displayed in 3 categories: Matched, Unmatched A, Unmatched B

## Matching Engine
- Rule-based pipeline: each rule scores a potential match
- Rules: amount (exact or tolerance), date (exact or range), reference (exact or fuzzy)
- Final score = weighted sum of individual rule scores
- Threshold configurable per reconciliation run

## Key Entities
- Transaction: normalized record with amount, date, reference, description
- DataSource: origin identifier (Source A or Source B)
- MatchRule: configurable matching criterion with weight and tolerance
- MatchResult: paired transactions with confidence score
- ReconciliationRun: a complete matching execution with config and results

## MVP Scope
- CSV upload and parsing (PapaParse)
- Column mapping UI
- Exact + tolerance matching on amount and date
- Results view with matched/unmatched tabs
- Everything runs client-side (no backend yet)