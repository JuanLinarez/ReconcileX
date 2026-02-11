import { supabase } from '@/lib/supabase';
import type { MatchingConfig } from '@/features/reconciliation/types';

/**
 * Expected Supabase tables (with RLS so users only see their org's data):
 *
 * - organization_members (user_id uuid, organization_id uuid)
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

  return {
    total_reconciliations,
    average_match_rate,
    total_ai_analyses,
  };
}
