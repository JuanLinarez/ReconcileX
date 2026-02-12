---
name: reconcilex-edge-functions
description: Create API endpoints for ReconcileX using Supabase Edge Functions. Use when building new Edge Functions, API endpoints, or backend services for the ReconcileX reconciliation app.
---

# ReconcileX Edge Functions

Expert guide for creating API endpoints in ReconcileX using Supabase Edge Functions (Deno runtime). Apply when creating or modifying Edge Functions in `supabase/functions/`.

## Stack

- Supabase Edge Functions (Deno runtime)
- TypeScript estricto
- Validación con Zod o validación manual
- Respuestas JSON estandarizadas

## Estructura Base

Toda Edge Function debe seguir este esqueleto:

```typescript
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Lógica del endpoint aquí...
    const result = { data: { message: 'OK' } }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

## Formato de Respuesta

| Caso | Formato |
|------|---------|
| Éxito | `{ data: T, meta?: { page, limit, total } }` |
| Error | `{ error: string, code?: string, details?: any }` |

## Validación de Input

Siempre validar el body antes de procesar. Opción manual:

```typescript
interface CreateTransactionInput {
  account_id: string
  date: string
  description: string
  amount: number
  currency?: string
}

function validateInput(body: unknown): CreateTransactionInput {
  if (!body || typeof body !== 'object') throw new Error('Body inválido')
  const b = body as Record<string, unknown>
  if (!b.account_id || typeof b.account_id !== 'string') throw new Error('account_id requerido')
  if (!b.date || typeof b.date !== 'string') throw new Error('date requerido')
  if (!b.description || typeof b.description !== 'string') throw new Error('description requerido')
  if (typeof b.amount !== 'number') throw new Error('amount debe ser número')
  return b as unknown as CreateTransactionInput
}
```

Alternativa con Zod: importar desde `https://deno.land/x/zod/mod.ts` y usar schemas.

## Patrones por Método HTTP

| Método | Uso | Requisitos |
|--------|-----|-------------|
| GET | Listar/obtener recursos | Siempre paginación (limit/offset) |
| POST | Crear recursos | Validar input, retornar recurso creado |
| PATCH | Actualizar parcialmente | Solo campos enviados |
| DELETE | Eliminar | Soft delete preferido (status = 'deleted'). Hard delete solo con confirmación |

## Convenciones

- **Nombres de funciones**: kebab-case (`get-transactions`, `create-reconciliation`)
- **Ubicación**: `supabase/functions/<nombre-funcion>/index.ts`
- Siempre manejar CORS
- Siempre verificar autenticación
- Siempre validar input en POST/PATCH
- Logging de errores con contexto
- Rate limiting cuando aplique

## Prohibiciones

- NO exponer `service_role_key` al cliente
- NO queries sin filtro de organización (multi-tenant)
- NO retornar stack traces en producción
- NO endpoints sin autenticación (salvo webhooks con verificación de firma)

## Recursos Adicionales

- Para ejemplos completos (GET paginado, POST, webhooks), ver [reference.md](reference.md)

## Checklist Pre-Deploy

- [ ] CORS configurado
- [ ] Auth verificada
- [ ] Input validado (POST/PATCH)
- [ ] Respuesta sigue formato estándar
- [ ] Errores no exponen detalles internos
- [ ] Queries filtradas por org/user (multi-tenant)
