---
name: reconcilex-react-components
description: Expert in creating React components for ReconcileX. Use when building UI components, forms, pages, or feature modules. Covers React 18+, TypeScript, Tailwind, Shadcn/UI, Lucide, React Hook Form, and Zod.
---

# ReconcileX React Components

Expert guide for building React components in ReconcileX. Apply when creating or modifying UI, forms, pages, or feature modules.

## Stack

- React 18+ (ReconcileX uses React 19) with strict TypeScript
- Tailwind CSS (utility-first)
- Shadcn/UI as base components
- Lucide React for icons
- React Hook Form + Zod for forms
- TanStack React Query for data fetching

## Component Structure

```typescript
// src/features/<feature>/NombreComponente.tsx

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface NombreComponenteProps {
  title: string
  onAction?: (id: string) => void
}

export const NombreComponente = ({ title, onAction }: NombreComponenteProps) => {
  const [loading, setLoading] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* contenido */}
      </CardContent>
    </Card>
  )
}
```

**No `any`**. Props always typed.

## File Organization

| Path | Purpose |
|------|---------|
| `components/ui/` | Shadcn base — do not modify directly |
| `components/common/` | Reusable (DataTable, SearchBar, StatusBadge) |
| `layouts/` | Header, Sidebar, PageLayout |
| `features/<feature>/` | Feature-specific components (current pattern) |
| `hooks/` | Custom hooks |
| `lib/` | Utils (formatters, validators) |

Current ReconcileX uses `features/` heavily: `upload`, `column-mapping`, `matching-rules`, `preview`, `reconciliation`, `results`, `anomalies`, `copilot`, etc.

## Data Fetching

Use custom hooks or TanStack Query — never raw fetch in components.

```typescript
// src/hooks/useTransactions.ts
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Transaction } from '@/types'

export const useTransactions = (accountId: string) => {
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('bank_transactions')
          .select('*')
          .eq('account_id', accountId)
          .order('date', { ascending: false })

        if (error) throw error
        setData(data ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setLoading(false)
      }
    }

    fetchTransactions()
  }, [accountId])

  return { data, loading, error }
}
```

## Forms: React Hook Form + Zod

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  description: z.string().min(1, 'Descripción requerida'),
  amount: z.number().positive('Monto debe ser positivo'),
  date: z.string().min(1, 'Fecha requerida'),
})

type FormData = z.infer<typeof schema>

// In component:
const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: { description: '', amount: 0, date: '' },
})
```

Existing schemas: `src/features/reconciliation/schemas.ts` (columnMapping, matchingRule, matchingConfig).

## Loading, Error, Empty States

Always handle all three:

```typescript
if (loading) return <Skeleton className="h-48 w-full" />
if (error) return <Alert variant="destructive">{error}</Alert>
if (data.length === 0) return <EmptyState message="No hay transacciones" />
return <TransactionList data={data} />
```

## Formatters

```typescript
// src/lib/formatters.ts
export const formatCurrency = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)

export const formatDate = (date: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(date))
```

## Tailwind Conventions

- Spacing: `p-4`, `p-6` for cards; `gap-4` for layouts
- Semantics: `text-destructive` for errors, `text-muted-foreground` for secondary
- Responsive: mobile-first, `sm:`, `md:`, `lg:`
- Dark mode: Shadcn CSS variables (handled automatically)
- Use `cn()` from `@/lib/utils` for conditional classes

## Prohibitions

- **NO** `any` in TypeScript
- **NO** `console.log` left in code
- **NO** direct fetch — use hooks or services
- **NO** inline styles — use Tailwind
- **NO** class components — functional only
- **NO** extra UI libraries without justification (Shadcn covers most needs)

## Existing ReconcileX Patterns

- Feature pages: `UploadPage`, `ColumnMappingPage`, `MatchingRulesPage`, `PreviewPage`, `ResultsPage`
- Shared UI: `components/ui/*`
- Layout: `AppLayout` in `layouts/`
- Icons: Lucide (`Check`, `Loader2`, `AlertTriangle`, etc.)

## Additional Resources

- For form examples with Shadcn Form, TanStack Query, and common components, see [reference.md](reference.md)
