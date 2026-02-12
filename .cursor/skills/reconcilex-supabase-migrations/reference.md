# Referencia: Migraciones Supabase ReconcileX

Ejemplo completo y casos especiales para migraciones.

## Ejemplo de Migración Completa

```sql
-- Migración: Crear tabla de transacciones bancarias
-- Descripción: Almacena transacciones importadas de bancos para reconciliación

CREATE TABLE bank_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  external_id TEXT, -- ID del banco original
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT DEFAULT 'USD' NOT NULL,
  category TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'unmatched', 'excluded')),
  matched_transaction_id UUID REFERENCES internal_transactions(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Índices para queries frecuentes
CREATE INDEX idx_bank_transactions_org ON bank_transactions(organization_id);
CREATE INDEX idx_bank_transactions_account ON bank_transactions(account_id);
CREATE INDEX idx_bank_transactions_date ON bank_transactions(date);
CREATE INDEX idx_bank_transactions_status ON bank_transactions(status);
CREATE INDEX idx_bank_transactions_external ON bank_transactions(external_id);

-- RLS
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org transactions"
  ON bank_transactions FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert to their org"
  ON bank_transactions FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update their org"
  ON bank_transactions FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  ));

-- DELETE: No permitido por defecto. Si se requiere, crear policy explícita.
-- CREATE POLICY "Users can delete..." ON bank_transactions FOR DELETE ...

-- Trigger updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

## Casos Especiales

### Tabla sin organization_id (p.ej. lookup tables)

Si la tabla es global (ej: `currencies`, `countries`):

```sql
-- Policy para lectura pública (datos de referencia)
CREATE POLICY "Anyone can read currencies"
  ON currencies FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE solo para admin (si aplica)
-- O sin policies de escritura si se gestiona por migraciones
```

### Tabla con user_id directo (sin organización)

```sql
CREATE POLICY "Users see own data"
  ON user_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own"
  ON user_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own"
  ON user_preferences FOR UPDATE
  USING (user_id = auth.uid());
```

### Unique constraints

```sql
-- Evitar duplicados por combo de columnas
ALTER TABLE bank_transactions
  ADD CONSTRAINT uq_bank_transactions_external_account
  UNIQUE (account_id, external_id);

-- Índice único para upsert (coalesce nulls si aplica)
CREATE UNIQUE INDEX idx_learned_patterns_upsert ON learned_patterns (
  organization_id,
  pattern_type,
  COALESCE(source_value, ''),
  COALESCE(target_value, '')
);
```

### Función update_updated_at compartida

La función `update_updated_at()` es idempotente. Usar `CREATE OR REPLACE` en la primera migración que la necesite; las siguientes solo crearán el trigger en su tabla.

```sql
-- Incluir en la primera migración que use triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Migraciones ALTER (modificar tabla existente)

```sql
-- Añadir columna
ALTER TABLE bank_transactions
  ADD COLUMN reconciled_at TIMESTAMPTZ;

-- Añadir índice
CREATE INDEX idx_bank_transactions_reconciled ON bank_transactions(reconciled_at);

-- Añadir RLS a tabla existente (si se creó sin RLS)
ALTER TABLE existing_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "..." ON existing_table ...
```

### Migraciones destructivas

**Requieren confirmación explícita del usuario.** No ejecutar sin que el usuario confirme.

```sql
-- Ejemplo: eliminar columna
-- ALTER TABLE bank_transactions DROP COLUMN deprecated_field;

-- Ejemplo: eliminar tabla
-- DROP TABLE IF EXISTS old_table CASCADE;
```

Siempre documentar impacto y backups antes de proceder.

## Nomenclatura de Archivos de Migración

Formato: `YYYYMMDDHHMMSS_descripcion_en_snake_case.sql`

Ejemplo: `20250212120000_create_bank_transactions.sql`
