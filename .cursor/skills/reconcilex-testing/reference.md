# ReconcileX Testing — Reference Examples

Detailed patterns and code examples for each test type.

---

## Unit Test — Pure Function

```typescript
// src/lib/formatters.test.ts
import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate } from './formatters'

describe('formatCurrency', () => {
  it('should format USD correctly', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56')
  })

  it('should handle zero', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('should handle negative amounts', () => {
    expect(formatCurrency(-500)).toBe('-$500.00')
  })

  it('should format other currencies', () => {
    expect(formatCurrency(1000, 'EUR')).toBe('€1,000.00')
  })
})
```

---

## Unit Test — Reconciliation Logic

```typescript
// src/services/reconciliation.test.ts
import { describe, it, expect } from 'vitest'
import { findExactMatches, calculateConfidence } from './reconciliation'

describe('findExactMatches', () => {
  const sourceTransactions = [
    { id: '1', reference: 'REF001', amount: 100.00, date: '2025-01-15' },
    { id: '2', reference: 'REF002', amount: 250.50, date: '2025-01-16' },
  ]

  const targetTransactions = [
    { id: 'a', reference: 'REF001', amount: 100.00, date: '2025-01-15' },
    { id: 'b', reference: 'REF003', amount: 300.00, date: '2025-01-17' },
  ]

  it('should match transactions with same reference and amount', () => {
    const matches = findExactMatches(sourceTransactions, targetTransactions)
    expect(matches).toHaveLength(1)
    expect(matches[0].source.id).toBe('1')
    expect(matches[0].target.id).toBe('a')
  })

  it('should return empty for no matches', () => {
    const matches = findExactMatches([], targetTransactions)
    expect(matches).toHaveLength(0)
  })
})

describe('calculateConfidence', () => {
  const defaultRule = { tolerance: { amount: 100 }, weight: 1 }

  it('should return 100 for exact match on all fields', () => {
    const match = {
      referenceExact: true,
      amountDiff: 0,
      daysDiff: 0,
      descriptionSimilarity: 1.0,
    }
    expect(calculateConfidence(match, defaultRule)).toBe(100)
  })

  it('should penalize amount difference beyond tolerance', () => {
    const match = {
      referenceExact: true,
      amountDiff: 50,
      daysDiff: 0,
      descriptionSimilarity: 1.0,
    }
    const score = calculateConfidence(match, { ...defaultRule, tolerance: { amount: 10 } })
    expect(score).toBeLessThan(100)
  })
})
```

---

## Component Test

```typescript
// src/components/TransactionTable.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransactionTable } from './TransactionTable'

const mockTransactions = [
  {
    id: '1',
    description: 'Pago proveedor',
    amount: -1500.00,
    date: '2025-01-15',
    status: 'matched',
  },
  {
    id: '2',
    description: 'Cobro cliente',
    amount: 3200.00,
    date: '2025-01-16',
    status: 'pending',
  },
]

describe('TransactionTable', () => {
  it('should render all transactions', () => {
    render(<TransactionTable transactions={mockTransactions} />)
    expect(screen.getByText('Pago proveedor')).toBeInTheDocument()
    expect(screen.getByText('Cobro cliente')).toBeInTheDocument()
  })

  it('should display formatted amounts', () => {
    render(<TransactionTable transactions={mockTransactions} />)
    expect(screen.getByText('-$1,500.00')).toBeInTheDocument()
    expect(screen.getByText('$3,200.00')).toBeInTheDocument()
  })

  it('should show status badges', () => {
    render(<TransactionTable transactions={mockTransactions} />)
    expect(screen.getByText('matched')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('should call onSelect when clicking a row', async () => {
    const onSelect = vi.fn()
    render(<TransactionTable transactions={mockTransactions} onSelect={onSelect} />)
    await userEvent.click(screen.getByText('Pago proveedor'))
    expect(onSelect).toHaveBeenCalledWith('1')
  })

  it('should show empty state when no transactions', () => {
    render(<TransactionTable transactions={[]} />)
    expect(screen.getByText(/no hay transacciones/i)).toBeInTheDocument()
  })
})
```

---

## Hook Test

```typescript
// src/hooks/useTransactions.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTransactions } from './useTransactions'

describe('useTransactions', () => {
  it('should return loading state initially', () => {
    const { result } = renderHook(() => useTransactions('account-1'))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toEqual([])
  })

  it('should return data after loading', async () => {
    const { result } = renderHook(() => useTransactions('account-1'))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.data.length).toBeGreaterThan(0)
    })
  })
})
```

---

## MSW — API Mock Setup

Use MSW handlers for API calls. Prefer integration tests that hit real logic with mocked HTTP when testing flows that depend on fetch/API.

```typescript
// src/__tests__/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/transactions/:accountId', ({ params }) => {
    return HttpResponse.json([
      { id: '1', amount: 100, reference: 'REF001' },
    ])
  }),
]
```

---

## Querying Best Practices

- Prefer `getByRole`, `getByLabelText`, `getByText` over `getByTestId`
- Use `findBy*` for async elements
- Use `queryBy*` when element may not exist
- Avoid implementation details (class names, internal state)
