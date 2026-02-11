/**
 * Apply learned patterns to improve suggestions.
 * Graceful degradation: if patterns fail to load, return suggestions unchanged.
 */

import {
  getColumnPairPreferences,
  getPatterns,
  getVendorMappings,
} from '@/lib/database';
import type { MatchingRule } from '@/features/reconciliation/types';

/**
 * Enhance suggested rules with learned patterns:
 * - Boost column pairs the user has used before
 * - Reorder and reweight based on learned preferences
 * - Returns enhanced rules and whether any patterns influenced the result
 */
export async function enhanceSuggestedRules(
  orgId: string,
  suggestedRules: MatchingRule[],
  _headersA: string[],
  _headersB: string[]
): Promise<{ rules: MatchingRule[]; influenced: boolean }> {
  if (!orgId) return { rules: suggestedRules, influenced: false };

  try {
    const prefs = await getColumnPairPreferences(orgId);
    if (prefs.length === 0) {
      return { rules: suggestedRules, influenced: false };
    }

    const prefMap = new Map<string, { frequency: number; context?: Record<string, unknown> }>();
    for (const p of prefs) {
      const key = `${p.columnA}::${p.columnB}`;
      const existing = prefMap.get(key);
      if (!existing || p.frequency > existing.frequency) {
        prefMap.set(key, { frequency: p.frequency, context: p.context });
      }
    }

    const rules: MatchingRule[] = [];
    let influenced = false;

    for (const rule of suggestedRules) {
      const key = `${rule.columnA}::${rule.columnB}`;
      const pref = prefMap.get(key);
      if (pref && pref.frequency >= 1) {
        influenced = true;
        const boosted = { ...rule, learned: true };
        if (pref.context?.matchType) {
          boosted.matchType = pref.context.matchType as MatchingRule['matchType'];
        }
        if (typeof pref.context?.weight === 'number') {
          boosted.weight = pref.context.weight;
        }
        boosted.weight = Math.min(1, boosted.weight * (1 + Math.log1p(pref.frequency) * 0.1));
        rules.push(boosted);
      } else {
        rules.push({ ...rule });
      }
    }

    const totalWeight = rules.reduce((s, r) => s + r.weight, 0);
    if (totalWeight > 0) {
      const factor = 1 / totalWeight;
      for (const r of rules) r.weight *= factor;
    }

    return { rules, influenced };
  } catch (err) {
    console.error('enhanceSuggestedRules', err);
    return { rules: suggestedRules, influenced: false };
  }
}

/**
 * Get learned vendor mappings for normalization.
 * Only returns mappings with frequency >= 2.
 */
export async function getLearnedVendorMappings(
  orgId: string
): Promise<Map<string, string>> {
  if (!orgId) return new Map();

  try {
    const mappings = await getVendorMappings(orgId);
    const map = new Map<string, string>();
    for (const m of mappings) {
      if (m.frequency >= 2) {
        map.set(m.sourceValue, m.targetValue);
      }
    }
    return map;
  } catch (err) {
    console.error('getLearnedVendorMappings', err);
    return new Map();
  }
}

/**
 * Get learned normalization rules for a specific column.
 */
export async function getLearnedNormalizationRules(
  orgId: string,
  column: string
): Promise<Array<{ original: string; normalized: string }>> {
  if (!orgId) return [];

  try {
    const patterns = await getPatterns(orgId, 'normalization_rule');
    return patterns
      .filter((p) => p.column_a === column && p.source_value && p.target_value)
      .map((p) => ({
        original: p.source_value!,
        normalized: p.target_value!,
      }));
  } catch (err) {
    console.error('getLearnedNormalizationRules', err);
    return [];
  }
}
