# ReconcileX React Components — Reference

Additional patterns and examples for the main skill.

## Form with Shadcn UI Controls

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const schema = z.object({
  description: z.string().min(1, 'Descripción requerida'),
  amount: z.coerce.number().positive('Monto debe ser positivo'),
  date: z.string().min(1, 'Fecha requerida'),
})

type FormData = z.infer<typeof schema>

export const TransactionForm = ({ onSubmit }: { onSubmit: (data: FormData) => void }) => {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { description: '', amount: 0, date: '' },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Guardando...' : 'Guardar'}
        </Button>
      </form>
    </Form>
  )
}
```

## TanStack Query Pattern

```typescript
import { useQuery } from '@tanstack/react-query'

export const useTransactions = (accountId: string) => {
  return useQuery({
    queryKey: ['transactions', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('*')
        .eq('account_id', accountId)
        .order('date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!accountId,
  })
}

// In component:
const { data, isLoading, error } = useTransactions(accountId)
```

## Reusable Common Components

| Component | Purpose |
|-----------|---------|
| `DataTable` | Table with sorting, pagination |
| `SearchBar` | Debounced search input |
| `StatusBadge` | Match status (matched, unmatched, partial) |
| `EmptyState` | Empty list with icon + message |
| `Skeleton` | Loading placeholder (from Shadcn) |

## Conditional Classes with cn()

```typescript
import { cn } from '@/lib/utils'

<Button
  className={cn(
    'w-full',
    isActive && 'bg-primary text-primary-foreground',
    isDisabled && 'opacity-50'
  )}
/>
```
