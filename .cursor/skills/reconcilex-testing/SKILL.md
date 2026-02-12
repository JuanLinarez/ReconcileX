---
name: reconcilex-testing
description: Expert in testing for ReconcileX using Vitest, React Testing Library, MSW. Use when writing tests, adding test coverage, reviewing test code, or when the user asks about testing in ReconcileX.
---

# ReconcileX Testing

Expert guide for writing and maintaining tests in ReconcileX. Apply when creating tests, improving coverage, or reviewing test code.

## Stack

| Tool | Purpose |
|------|---------|
| **Vitest** | Test runner |
| **React Testing Library** | Component tests |
| **MSW** | API mocks |
| **@testing-library/user-event** | User interactions |

## Structure

```
src/
  __tests__/           → Integration tests
  components/
    TransactionTable/
      TransactionTable.tsx
      TransactionTable.test.tsx   → Test next to component
  hooks/
    useTransactions.ts
    useTransactions.test.ts
  services/
    reconciliation.ts
    reconciliation.test.ts
  lib/
    formatters.ts
    formatters.test.ts
```

## Naming

- **Files**: `NombreModulo.test.ts(x)`
- **describe**: Module/component name
- **it/test**: "should [expected behavior]"

## Setup (if missing)

```bash
npm install -D vitest @testing-library/react @testing-library/user-event jsdom
npm install -D msw
```

Add to `package.json`:
```json
"scripts": { "test": "vitest" }
```

Configure `vitest.config.ts` with `environment: 'jsdom'` for React.

## What to Test (Priority)

| Priority | Focus |
|----------|-------|
| **Always** | Reconciliation/matching logic (core business) |
| **Always** | Formatters and utilities |
| **High** | Components with complex conditional logic |
| **Medium** | Custom hooks |
| **Low** | Purely presentational components |

## Patterns Summary

- **Pure functions**: Input → output assertions
- **Reconciliation logic**: Mock transactions, assert match results and confidence scores
- **Components**: Render, query by role/text, userEvent for interactions
- **Hooks**: `renderHook` + `waitFor` for async

## Prohibitions

- **NO** tests that only verify implementation details
- **NO** snapshot tests as primary test
- **NO** over-mocking — prefer integration tests when possible
- **NO** commented or `.skip` tests without an associated issue
- **NO** testing third-party libraries (Shadcn, Supabase client)

## ReconcileX-Specific Targets

- `src/features/reconciliation/engine/matchingEngine.ts` — matching logic
- `src/features/reconciliation/utils/` — levenshtein, normalize, parseCsv
- `src/features/matching-rules/numericToleranceUtils.ts` — tolerance calculations
- `src/features/normalization/normalizationService.ts` — normalization rules

## Additional Resources

- For detailed code examples by type (unit, component, hook), see [reference.md](reference.md)
