-- Learned patterns table for pattern learning from user decisions
-- Run in Supabase SQL editor if using Supabase, or apply via your migration tool

CREATE TABLE IF NOT EXISTS learned_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pattern_type text NOT NULL CHECK (pattern_type IN (
    'vendor_mapping',
    'match_acceptance',
    'match_rejection',
    'normalization_rule',
    'column_pair_preference'
  )),
  source_value text,
  target_value text,
  column_a text,
  column_b text,
  context jsonb DEFAULT '{}',
  frequency int NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index for upsert: coalesce nulls so we can match column_pair_preference (null source/target)
CREATE UNIQUE INDEX IF NOT EXISTS idx_learned_patterns_upsert ON learned_patterns (
  organization_id,
  pattern_type,
  COALESCE(source_value, ''),
  COALESCE(target_value, ''),
  COALESCE(column_a, ''),
  COALESCE(column_b, '')
);

CREATE INDEX IF NOT EXISTS idx_learned_patterns_org_type ON learned_patterns(organization_id, pattern_type);

-- RLS: users see only their org's patterns
ALTER TABLE learned_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their org's learned patterns"
  ON learned_patterns
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );
