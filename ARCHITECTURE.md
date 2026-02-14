# Architecture — ReconcileX

## System Overview
ReconcileX is an AI-powered financial reconciliation SaaS for Shared Service Centers. Users upload two data sources, configure matching rules, and the system automatically matches transactions using a configurable rule-based engine with AI-powered features.

## Reconciliation Flow (5 Steps)

Upload (1) -> Normalize (2) -> Preview (3) -> Matching Rules (4) -> Results (5)

1. Upload: 2-4 CSV/Excel files via drag and drop. PapaParse/SheetJS parsing.
2. Normalize: Auto-scan for data quality issues plus optional AI suggestions via /api/normalize.
3. Preview: Side-by-side view of both sources (first 50 rows).
4. Matching Rules: Configure rules (amount, date, reference, vendor), weights, and confidence threshold. Smart suggestions, pattern learning, AI rule builder.
5. Results: Summary dashboard, matched/unmatched/anomalies tabs with pagination, export, AI analysis, copilot.

## 3-Tier Matching Architecture

Tier 1 CLIENT-SIDE (less than 1500 total rows):
  useMatching hook -> matchingEngine.ts -> instant

Tier 2 VERCEL DIRECT (1500 to 30000 total rows):
  serializeToCsv -> POST /api/match body -> full response

Tier 3 STORAGE TRANSPORT (30000+ total rows):
  Upload to Supabase Storage -> signed URLs -> /api/match downloads -> index-based response -> frontend reconstructs

Tier routing: serverMatching.ts decides automatically based on payload size (threshold: 3.5MB).
ReconciliationFlowPage.tsx is tier-agnostic — calls runServerMatching() for any server matching.

### Capacity (tested):
  1,000 total rows: less than 5s, Client
  10,000 total rows: about 25s, Vercel Direct
  25,000 total rows: about 75s, Vercel Direct
  50,000 total rows: about 3 min, Storage
  90,000 total rows: about 4:10, Storage
  100,000 total rows: about 5 min, Storage (estimated)

### Constraints:
  Vercel body limit: 4.5MB (request AND response)
  Vercel timeout: 300s (Pro plan)
  Vercel memory: 1024MB
  Supabase Storage: 50MB per file
  Supabase Edge Functions: 150MB memory (NOT used for matching — too low)

## Matching Engine
- Rule-based pipeline: each rule scores a potential match 0-1
- Rule types: exact, tolerance_numeric (fixed/percentage), tolerance_date (plus or minus days), similar_text (Levenshtein), contains
- Final score = weighted sum of rule scores (weights must sum to 1.0)
- Pairs above minConfidenceThreshold become matches
- 1:1 matching: greedy best-first with binary search pre-filter by amount
- Group matching: 1:Many and Many:1 relationships
- Optimizations: single-row DP Levenshtein, early termination, similarity cache

## Key Entities (src/features/reconciliation/types.ts)
- Transaction: normalized record (id, source, amount, date, reference, rowIndex, raw)
- MatchingRule: column mapping with match type, tolerance, weight
- MatchingConfig: rules[] + minConfidenceThreshold + matchingType
- MatchResult: paired transactions with confidence score
- ReconciliationResult: matched[] + unmatchedA[] + unmatchedB[] + config
- ParsedCsv: headers[] + rows[] + source + filename

## API Endpoints (Vercel Serverless)
  POST /api/match — Server-side matching (Tier 2 and 3) — No AI cost
  POST /api/analyze — AI exception analysis for unmatched — Yes AI cost
  POST /api/copilot — Reconciliation Copilot chat — Yes AI cost
  POST /api/nl-rules — Natural language to MatchingConfig — Yes AI cost
  POST /api/normalize — AI normalization suggestions — Yes AI cost

### /api/match accepts 3 input formats:
  1. { storageUrlA, storageUrlB, config, responseMode } — Tier 3 (Storage)
  2. { csvA, csvB, config } — Tier 2 (Direct CSV text)
  3. { sourceA, sourceB, config } — Legacy (JSON rows)

### /api/match response modes:
  responseMode 'indices': { mode, matchedPairs: [{indexA, indexB, confidence}], unmatchedIndicesA, unmatchedIndicesB }
  Default: { matched, unmatchedA, unmatchedB, config, stats }

## Database (Supabase PostgreSQL + RLS)
- organizations, organization_members (multi-tenancy)
- reconciliations (run history with metadata — NOT individual transactions)
- ai_analyses (AI analysis results)
- matching_templates (saved rule configurations)
- learned_patterns (pattern learning: vendor mappings, column preferences)
- Storage bucket: reconciliation-files (temporary CSV upload for Tier 3)

## AI Features
1. Smart Rule Suggestions: Role-based column classification -> auto-generated rules
2. Pattern Learning: Captures user decisions, applies to future suggestions
3. AI Rule Builder: Natural language -> MatchingConfig via Claude
4. Exception Analysis: AI analyzes why a transaction is unmatched
5. Copilot: Slide-out chat with reconciliation context
6. Smart Normalization: AI vendor name mapping suggestions

## Anomaly Detection (Client-Side, No AI Cost)
8 detectors: Duplicate Payment, Threshold Splitting, Duplicate Reference, Amount Mismatch Pattern, Unusual Amount (more than 3 sigma), Stale Unmatched (more than 30 days), Round Amount (5K+), Weekend Transaction.

## Security
- Row Level Security on all tables (organization isolation)
- Zero data retention (CSVs processed in memory, deleted after matching)
- TLS 1.3 in transit, AES-256 at rest
- Storage bucket RLS by organization folder path
- Signed URLs with 5-minute expiry for Storage transport
- No individual transaction data stored in database

## Design System

### Branding
- Keep sidebar logo and subtitle as-is

### Colors (Updated)
- --app-bg: #F8FAFC (Stripe-style warm white)
- --app-bg-shell: #F1F5F9 (page shell behind sidebar — softer)
- --app-sidebar: #0F172A (deep slate)
- --app-primary: #2563EB (blue — unchanged)
- --app-ai-accent: #7C3AED (violet — AI features)
- --app-ai-accent-light: #EDE9FE (violet light bg)
- --app-success: #059669
- --app-body: #64748B (slightly lighter for softer contrast)
- --app-border: #E2E8F0

### Fonts (Updated)
- --font-heading: "Inter", system-ui, sans-serif (weight 600-700)
- --font-body: "Inter", system-ui, sans-serif (weight 400-500)
- Google Fonts import: Inter weights 400, 500, 600, 700

### Component Patterns (Updated)
- Cards: bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]
- Cards hover: hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.06)] transition-shadow
- Buttons primary: bg-[--app-primary] rounded-lg px-4 py-2.5 shadow-sm active:scale-[0.98]
- Buttons secondary: bg-white border-slate-200 rounded-lg
- Table headers: bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500
- Table rows: py-4 px-5 hover:bg-slate-50/50 border-b border-slate-100
- Section headers: text-sm font-semibold tracking-wide uppercase (NO navy bg blocks)
- Stat numbers: text-4xl font-semibold tabular-nums
- Stat labels: text-xs font-medium uppercase tracking-wider text-[--app-body]
- AI features: Dark bg (slate-900), violet accents, Sparkles icon
- Status badges: pill style — bg-emerald-50 text-emerald-700 rounded-full
- Sidebar active: bg-white/10 text-white rounded-lg
- Page spacing: mb-8 between major sections, p-6 inside cards, gap-5 for grids

### AI Rule Builder
- Dark card: bg-gradient-to-br from-slate-900 to-slate-800
- Violet radial gradient decoration
- Input: bg-white/10 backdrop-blur border-white/10
- Button: bg-violet-500 with Sparkles icon
- Pills: bg-white/10 text-white/70 rounded-full

### General
- Components: shadcn/ui (Button, Card, Dialog, Tabs, Table, etc.)
- Icons: Lucide React
