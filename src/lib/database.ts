import { supabase } from '@/lib/supabase';
import type { MatchingConfig } from '@/features/reconciliation/types';

/**
 * Expected Supabase tables (with RLS so users only see their org's data):
 *
 * - organizations (id uuid, name text)
 * - organization_members (user_id uuid, organization_id uuid, role text)
 * - reconciliations (id uuid, organization_id uuid, created_at timestamptz,
 *   source_a_name, source_b_name, source_a_rows, source_b_rows, matched_count,
 *   unmatched_a_count, unmatched_b_count, match_rate numeric, matched_amount numeric,
 *   matching_type text, rules_config jsonb, results_summary jsonb)
 * - ai_analyses (id uuid, reconciliation_id uuid, transaction_data jsonb,
 *   analysis_result jsonb, created_at timestamptz)
 */

/** Organization id for the current user (from organization_members). */
export async function getUserOrganization(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('getUserOrganization', error);
    return null;
  }
  return data?.organization_id ?? null;
}

export interface SaveReconciliationInput {
  organization_id: string;
  source_a_name: string;
  source_b_name: string;
  source_a_rows: number;
  source_b_rows: number;
  matched_count: number;
  unmatched_a_count: number;
  unmatched_b_count: number;
  match_rate: number;
  matched_amount?: number;
  matching_type: string;
  rules_config: MatchingConfig;
  results_summary: Record<string, unknown>;
}

export interface ReconciliationRow {
  id: string;
  organization_id: string;
  created_at: string;
  source_a_name: string;
  source_b_name: string;
  source_a_rows: number;
  source_b_rows: number;
  matched_count: number;
  unmatched_a_count: number;
  unmatched_b_count: number;
  match_rate: number;
  matched_amount: number | null;
  matching_type: string;
  rules_config: unknown;
  results_summary: unknown;
}

/** Insert a new reconciliation. Returns the created row id. */
export async function saveReconciliation(data: SaveReconciliationInput): Promise<string | null> {
  const { data: row, error } = await supabase
    .from('reconciliations')
    .insert({
      organization_id: data.organization_id,
      source_a_name: data.source_a_name,
      source_b_name: data.source_b_name,
      source_a_rows: data.source_a_rows,
      source_b_rows: data.source_b_rows,
      matched_count: data.matched_count,
      unmatched_a_count: data.unmatched_a_count,
      unmatched_b_count: data.unmatched_b_count,
      match_rate: data.match_rate,
      matched_amount: data.matched_amount ?? null,
      matching_type: data.matching_type,
      rules_config: data.rules_config as unknown as Record<string, unknown>,
      results_summary: data.results_summary,
    })
    .select('id')
    .single();
  if (error) {
    console.error('saveReconciliation', error);
    return null;
  }
  return row?.id ?? null;
}

/** Get all reconciliations for an org, most recent first. */
export async function getReconciliations(orgId: string): Promise<ReconciliationRow[]> {
  const { data, error } = await supabase
    .from('reconciliations')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getReconciliations', error);
    return [];
  }
  return (data ?? []) as ReconciliationRow[];
}

export interface SaveAiAnalysisInput {
  reconciliation_id: string;
  transaction_data: Record<string, unknown>;
  analysis_result: Record<string, unknown>;
}

/** Insert an AI analysis record. */
export async function saveAiAnalysis(data: SaveAiAnalysisInput): Promise<boolean> {
  const { error } = await supabase.from('ai_analyses').insert({
    reconciliation_id: data.reconciliation_id,
    transaction_data: data.transaction_data,
    analysis_result: data.analysis_result,
  });
  if (error) {
    console.error('saveAiAnalysis', error);
    return false;
  }
  return true;
}

export interface ReconciliationStats {
  total_reconciliations: number;
  average_match_rate: number | null;
  total_ai_analyses: number;
  total_records_processed: number;
  total_matched: number;
}

/** Get aggregate stats for an org. */
export async function getReconciliationStats(orgId: string): Promise<ReconciliationStats> {
  const recs = await getReconciliations(orgId);
  const total_reconciliations = recs.length;
  const ids = recs.map((r) => r.id);
  let total_ai_analyses = 0;
  if (ids.length > 0) {
    const { count } = await supabase
      .from('ai_analyses')
      .select('*', { count: 'exact', head: true })
      .in('reconciliation_id', ids);
    total_ai_analyses = count ?? 0;
  }
  const average_match_rate =
    recs.length > 0
      ? recs.reduce((sum, r) => sum + r.match_rate, 0) / recs.length
      : null;
  const total_records_processed = recs.reduce(
    (sum, r) => sum + r.source_a_rows + r.source_b_rows,
    0
  );
  const total_matched = recs.reduce((sum, r) => sum + r.matched_count, 0);

  return {
    total_reconciliations,
    average_match_rate,
    total_ai_analyses,
    total_records_processed,
    total_matched,
  };
}

/** Organization by id. */
export async function getOrganization(
  orgId: string
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('getOrganization', error);
    return null;
  }
  return data as { id: string; name: string } | null;
}

/** Update organization name. */
export async function updateOrganizationName(
  orgId: string,
  name: string
): Promise<boolean> {
  const { error } = await supabase
    .from('organizations')
    .update({ name: name.trim() })
    .eq('id', orgId);
  if (error) {
    console.error('updateOrganizationName', error);
    return false;
  }
  return true;
}

/** Update user profile (full_name in user_metadata). */
export async function updateUserProfile(updates: {
  full_name?: string;
}): Promise<{ error: string | null }> {
  const data: Record<string, unknown> = {};
  if (updates.full_name !== undefined) {
    data.full_name = updates.full_name;
  }
  if (Object.keys(data).length === 0) {
    return { error: null };
  }
  const { error } = await supabase.auth.updateUser({ data });
  return {
    error: error ? error.message : null,
  };
}

/** Change user password. */
export async function changePassword(newPassword: string): Promise<{
  error: string | null;
}> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return {
    error: error ? error.message : null,
  };
}

/** Update user preferences (default_currency, timezone in user_metadata). */
export async function updateUserPreferences(updates: {
  default_currency?: string;
  timezone?: string;
}): Promise<{ error: string | null }> {
  const data: Record<string, unknown> = {};
  if (updates.default_currency !== undefined) {
    data.default_currency = updates.default_currency;
  }
  if (updates.timezone !== undefined) {
    data.timezone = updates.timezone;
  }
  if (Object.keys(data).length === 0) {
    return { error: null };
  }
  const { error } = await supabase.auth.updateUser({ data });
  return {
    error: error ? error.message : null,
  };
}

/** Get user role in organization. */
export async function getUserRole(
  orgId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('getUserRole', error);
    return null;
  }
  return typeof data?.role === 'string' ? data.role : null;
}

export interface MatchingTemplateRow {
  id: string;
  name: string;
  description: string | null;
  config: MatchingConfig;
  is_default: boolean;
  created_at: string;
}

/** Get all templates for an org, ordered by created_at desc. */
export async function getTemplates(
  orgId: string
): Promise<MatchingTemplateRow[]> {
  const { data, error } = await supabase
    .from('matching_templates')
    .select('id, name, description, config, is_default, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getTemplates', error);
    return [];
  }
  return (data ?? []) as MatchingTemplateRow[];
}

/** Insert a new template. Returns the created template or null. */
export async function saveTemplate(
  orgId: string,
  userId: string,
  data: { name: string; description?: string; config: MatchingConfig }
): Promise<MatchingTemplateRow | null> {
  const { data: row, error } = await supabase
    .from('matching_templates')
    .insert({
      organization_id: orgId,
      user_id: userId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      config: data.config as unknown as Record<string, unknown>,
    })
    .select('id, name, description, config, is_default, created_at')
    .single();
  if (error) {
    console.error('saveTemplate', error);
    return null;
  }
  return row as MatchingTemplateRow;
}

/** Update a template. */
export async function updateTemplate(
  id: string,
  data: {
    name?: string;
    description?: string;
    config?: MatchingConfig;
    is_default?: boolean;
  }
): Promise<boolean> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) updates.name = data.name.trim();
  if (data.description !== undefined) updates.description = data.description?.trim() || null;
  if (data.config !== undefined) updates.config = data.config as unknown as Record<string, unknown>;
  if (data.is_default !== undefined) updates.is_default = data.is_default;

  const { error } = await supabase
    .from('matching_templates')
    .update(updates)
    .eq('id', id);
  if (error) {
    console.error('updateTemplate', error);
    return false;
  }
  return true;
}

/** Delete a template by id. */
export async function deleteTemplate(id: string): Promise<boolean> {
  const { error } = await supabase.from('matching_templates').delete().eq('id', id);
  if (error) {
    console.error('deleteTemplate', error);
    return false;
  }
  return true;
}

/** Reconciliations grouped by day for last 30 days. */
export async function getReconciliationsByPeriod(
  orgId: string
): Promise<Array<{ date: string; count: number; avgMatchRate: number }>> {
  const recs = await getReconciliations(orgId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const filtered = recs.filter((r) => new Date(r.created_at) >= cutoff);

  const byDate = new Map<string, { count: number; sumRate: number }>();
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const key = d.toISOString().slice(0, 10);
    byDate.set(key, { count: 0, sumRate: 0 });
  }

  for (const r of filtered) {
    const key = r.created_at.slice(0, 10);
    const entry = byDate.get(key);
    if (entry) {
      entry.count += 1;
      entry.sumRate += r.match_rate;
    } else {
      byDate.set(key, { count: 1, sumRate: r.match_rate });
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { count, sumRate }]) => ({
      date,
      count,
      avgMatchRate: count > 0 ? sumRate / count : 0,
    }));
}

/** Match rate distribution in 4 buckets. */
export async function getMatchRateDistribution(
  orgId: string
): Promise<Array<{ range: string; count: number }>> {
  const recs = await getReconciliations(orgId);
  const buckets: Record<string, number> = {
    '0-25%': 0,
    '25-50%': 0,
    '50-75%': 0,
    '75-100%': 0,
  };

  for (const r of recs) {
    const pct = r.match_rate;
    if (pct < 0.25) buckets['0-25%'] += 1;
    else if (pct < 0.5) buckets['25-50%'] += 1;
    else if (pct < 0.75) buckets['50-75%'] += 1;
    else buckets['75-100%'] += 1;
  }

  return [
    { range: '0-25%', count: buckets['0-25%'] },
    { range: '25-50%', count: buckets['25-50%'] },
    { range: '50-75%', count: buckets['50-75%'] },
    { range: '75-100%', count: buckets['75-100%'] },
  ];
}

/** Top 5 source pairs by count. */
export async function getTopSourcePairs(
  orgId: string
): Promise<Array<{ pair: string; count: number; avgMatchRate: number }>> {
  const recs = await getReconciliations(orgId);
  const byPair = new Map<string, { count: number; sumRate: number }>();

  for (const r of recs) {
    const pair = `${r.source_a_name} vs ${r.source_b_name}`;
    const entry = byPair.get(pair);
    if (entry) {
      entry.count += 1;
      entry.sumRate += r.match_rate;
    } else {
      byPair.set(pair, { count: 1, sumRate: r.match_rate });
    }
  }

  return Array.from(byPair.entries())
    .map(([pair, { count, sumRate }]) => ({
      pair,
      count,
      avgMatchRate: count > 0 ? sumRate / count : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/** ---------------------------------------------------------------------------
 * Learned patterns table (run in Supabase SQL editor if not exists):
 *
 * CREATE TABLE IF NOT EXISTS learned_patterns (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 *   pattern_type text NOT NULL,
 *   source_value text,
 *   target_value text,
 *   column_a text,
 *   column_b text,
 *   context jsonb DEFAULT '{}',
 *   frequency int NOT NULL DEFAULT 1,
 *   last_used_at timestamptz NOT NULL DEFAULT now(),
 *   created_at timestamptz NOT NULL DEFAULT now(),
 *   UNIQUE(organization_id, pattern_type, source_value, target_value, column_a, column_b)
 * );
 * CREATE INDEX IF NOT EXISTS idx_learned_patterns_org_type ON learned_patterns(organization_id, pattern_type);
 * --------------------------------------------------------------------------- */

export type PatternType =
  | 'vendor_mapping'
  | 'match_acceptance'
  | 'match_rejection'
  | 'normalization_rule'
  | 'column_pair_preference';

export interface LearnedPattern {
  id: string;
  organization_id: string;
  pattern_type: PatternType;
  source_value: string | null;
  target_value: string | null;
  column_a: string | null;
  column_b: string | null;
  context: Record<string, unknown>;
  frequency: number;
  last_used_at: string;
  created_at: string;
}

export interface RecordPatternInput {
  organization_id?: string;
  pattern_type: PatternType;
  source_value?: string | null;
  target_value?: string | null;
  column_a?: string | null;
  column_b?: string | null;
  context?: Record<string, unknown>;
}

/** Upsert pattern: if exists (org + type + source_value + target_value + column_a + column_b), increment frequency and update last_used_at. Otherwise insert. */
export async function recordPattern(
  orgId: string,
  pattern: RecordPatternInput
): Promise<boolean> {
  const row = {
    organization_id: orgId,
    pattern_type: pattern.pattern_type,
    source_value: pattern.source_value ?? null,
    target_value: pattern.target_value ?? null,
    column_a: pattern.column_a ?? null,
    column_b: pattern.column_b ?? null,
    context: pattern.context ?? {},
    frequency: 1,
    last_used_at: new Date().toISOString(),
  };

  let q = supabase
    .from('learned_patterns')
    .select('id, frequency')
    .eq('organization_id', orgId)
    .eq('pattern_type', pattern.pattern_type);
  q = pattern.source_value != null ? q.eq('source_value', pattern.source_value) : q.is('source_value', null);
  q = pattern.target_value != null ? q.eq('target_value', pattern.target_value) : q.is('target_value', null);
  q = pattern.column_a != null ? q.eq('column_a', pattern.column_a) : q.is('column_a', null);
  q = pattern.column_b != null ? q.eq('column_b', pattern.column_b) : q.is('column_b', null);
  const { data: rows } = await q.limit(1);
  const existing = rows?.[0];

  if (existing) {
    const { error } = await supabase
      .from('learned_patterns')
      .update({
        frequency: (existing as { frequency: number }).frequency + 1,
        last_used_at: row.last_used_at,
      })
      .eq('id', (existing as { id: string }).id);
    if (error) {
      console.error('recordPattern update', error);
      return false;
    }
    return true;
  }

  const { error } = await supabase.from('learned_patterns').insert(row);
  if (error) {
    console.error('recordPattern insert', error);
    return false;
  }
  return true;
}

/** Fetch patterns, optionally filtered by type, ordered by frequency desc. */
export async function getPatterns(
  orgId: string,
  type?: PatternType
): Promise<LearnedPattern[]> {
  let q = supabase
    .from('learned_patterns')
    .select('*')
    .eq('organization_id', orgId)
    .order('frequency', { ascending: false });
  if (type) {
    q = q.eq('pattern_type', type);
  }
  const { data, error } = await q;
  if (error) {
    console.error('getPatterns', error);
    return [];
  }
  return (data ?? []) as LearnedPattern[];
}

/** Convenience: get all vendor_mapping patterns. */
export async function getVendorMappings(
  orgId: string
): Promise<Array<{ sourceValue: string; targetValue: string; frequency: number }>> {
  const patterns = await getPatterns(orgId, 'vendor_mapping');
  return patterns
    .filter((p) => p.source_value && p.target_value)
    .map((p) => ({
      sourceValue: p.source_value!,
      targetValue: p.target_value!,
      frequency: p.frequency,
    }));
}

/** Convenience: get all column_pair_preference patterns. */
export async function getColumnPairPreferences(
  orgId: string
): Promise<Array<{ columnA: string; columnB: string; frequency: number; context?: Record<string, unknown> }>> {
  const patterns = await getPatterns(orgId, 'column_pair_preference');
  return patterns
    .filter((p) => p.column_a && p.column_b)
    .map((p) => ({
      columnA: p.column_a!,
      columnB: p.column_b!,
      frequency: p.frequency,
      context: (p.context as Record<string, unknown>) ?? undefined,
    }));
}

/** AI analyses count per day for last 30 days. */
export async function getAiAnalysesByPeriod(
  orgId: string
): Promise<Array<{ date: string; count: number }>> {
  const recs = await getReconciliations(orgId);
  const ids = recs.map((r) => r.id);
  if (ids.length === 0) {
    const empty: Array<{ date: string; count: number }> = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      empty.push({ date: d.toISOString().slice(0, 10), count: 0 });
    }
    return empty.sort((a, b) => a.date.localeCompare(b.date));
  }

  const { data, error } = await supabase
    .from('ai_analyses')
    .select('created_at')
    .in('reconciliation_id', ids);

  if (error) {
    console.error('getAiAnalysesByPeriod', error);
    return [];
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const byDate = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    byDate.set(d.toISOString().slice(0, 10), 0);
  }

  for (const row of data ?? []) {
    const created = (row as { created_at: string }).created_at;
    if (created && new Date(created) >= cutoff) {
      const key = created.slice(0, 10);
      byDate.set(key, (byDate.get(key) ?? 0) + 1);
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}
