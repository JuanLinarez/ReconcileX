---
name: reconcilex-supabase-migrations
description: Expert in Supabase (PostgreSQL) database migrations for ReconcileX. Generates migrations following naming conventions, RLS, triggers, and structure. Use when creating or modifying tables, schemas, migrations, or database structures in Supabase.
---

# Migraciones Supabase para ReconcileX

Guía experta para crear migraciones de base de datos en ReconcileX. Todas las migraciones deben seguir estas convenciones.

## Cuándo Aplicar

- Crear nuevas tablas
- Modificar esquema existente
- Añadir índices, constraints o RLS
- Migraciones en `supabase/migrations/`

## Convenciones de Naming

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Tablas | snake_case, plural | `bank_transactions`, `reconciliation_rules` |
| Columnas | snake_case | `created_at`, `account_id` |
| Foreign keys | `tabla_singular_id` | `client_id`, `transaction_id` |
| Índices | `idx_tabla_columna` | `idx_bank_transactions_account_id` |
| Constraints | `chk_tabla_condicion`, `uq_tabla_columna` | `chk_transactions_status`, `uq_orgs_slug` |

## Estructura Obligatoria por Tabla

Toda tabla debe incluir:

```sql
id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
```

## RLS (Obligatorio)

SIEMPRE crear RLS en cada tabla:

```sql
ALTER TABLE nombre_tabla ENABLE ROW LEVEL SECURITY;
```

**Policies estándar** (multi-tenant vía `organization_members`):

- **SELECT**: usuario ve solo datos de sus organizaciones
- **INSERT**: usuario inserta solo en sus organizaciones
- **UPDATE**: usuario actualiza solo sus datos
- **DELETE**: evaluar necesidad; por defecto NO permitir

## Trigger updated_at

Crear función global (si no existe) y trigger por tabla:

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON nombre_tabla
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

## Orden de la Migración

1. Comentario con descripción
2. `CREATE TABLE` con columnas
3. Índices necesarios
4. RLS policies
5. Trigger `updated_at`
6. Comentarios en español para decisiones no obvias

## Prohibiciones

- NO crear tablas sin RLS
- NO usar SERIAL para IDs (usar UUID)
- NO olvidar `created_at` y `updated_at`
- NO migraciones destructivas sin confirmación explícita (`DROP TABLE`, `DROP COLUMN`)
- NO almacenar datos sensibles sin encriptación

## Ejemplo Resumido

```sql
-- Migración: Crear tabla de transacciones bancarias
CREATE TABLE bank_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'unmatched')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_bank_transactions_org ON bank_transactions(organization_id);
CREATE INDEX idx_bank_transactions_account ON bank_transactions(account_id);

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org transactions"
  ON bank_transactions FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert to their org"
  ON bank_transactions FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update their org"
  ON bank_transactions FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

## Recursos Adicionales

- Ejemplo completo con políticas UPDATE/DELETE y casos especiales: [reference.md](reference.md)

## Checklist Pre-Migración

- [ ] Naming: snake_case, plural en tablas
- [ ] `id`, `created_at`, `updated_at` presentes
- [ ] Índices en FKs y columnas de filtro frecuente
- [ ] RLS habilitado y policies definidas
- [ ] Trigger `updated_at` creado
- [ ] Sin SERIAL, sin datos sensibles sin encriptar
