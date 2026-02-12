# ReconcileX Edge Functions — Referencia Detallada

## Ejemplo Completo: GET con Paginación

```typescript
// supabase/functions/get-transactions/index.ts

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

// En el handler, después de verificar auth:
const url = new URL(req.url)
const limit = Math.min(parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT)), MAX_LIMIT)
const offset = parseInt(url.searchParams.get('offset') ?? '0') || 0

const { data, error } = await supabaseClient
  .from('transactions')
  .select('*', { count: 'exact' })
  .eq('organization_id', user.user_metadata.organization_id)
  .range(offset, offset + limit - 1)

if (error) throw error

return new Response(
  JSON.stringify({
    data,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: data?.length ?? 0 }
  }),
  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
)
```

## Ejemplo: POST con Validación

```typescript
// Después de auth:
const body = await req.json()
const input = validateInput(body)

const { data, error } = await supabaseClient
  .from('transactions')
  .insert({
    ...input,
    organization_id: user.user_metadata.organization_id,
    created_by: user.id
  })
  .select()
  .single()

if (error) throw error

return new Response(
  JSON.stringify({ data }),
  { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
)
```

## Ejemplo: Respuesta de Error Controlada

```typescript
// En catch o para errores de validación:
return new Response(
  JSON.stringify({
    error: 'Parámetros inválidos',
    code: 'VALIDATION_ERROR',
    details: { field: 'amount', message: 'Debe ser un número positivo' }
  }),
  { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
)
```

## Webhook con Verificación de Firma

Para endpoints públicos (webhooks), verificar firma en lugar de JWT:

```typescript
const signature = req.headers.get('x-webhook-signature')
const body = await req.text()
// Verificar HMAC o firma según proveedor
// Si inválido: return 401
```

## Deploy

```bash
supabase functions deploy <nombre-funcion>
```
