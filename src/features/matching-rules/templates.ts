/**
 * Template system for matching rule configurations.
 * Built-in templates are defined in code; custom templates stored in localStorage.
 */

import type { MatchingConfig, MatchingRule } from '@/features/reconciliation/types';
import { nextRuleId } from './defaultRules';

const STORAGE_KEY = 'reconcilex-matching-templates';

export interface SavedTemplate {
  id: string;
  name: string;
  description?: string;
  config: MatchingConfig;
  builtIn?: boolean;
}

function makeRule(
  id: string,
  partial: Omit<MatchingRule, 'id' | 'weight'> & { weight?: number }
): MatchingRule {
  return {
    id,
    weight: partial.weight ?? 1 / 3,
    ...partial,
  };
}

/** Built-in templates (cannot be deleted). Column names are placeholders; user may need to map. */
export const BUILT_IN_TEMPLATES: SavedTemplate[] = [
  {
    id: 'builtin-ap-bank',
    name: 'AP vs Bank (Standard)',
    description: 'Amount (tolerance 0.5%), Date (±3 days), Reference (exact).',
    builtIn: true,
    config: {
      matchingType: 'oneToOne',
      minConfidenceThreshold: 0.6,
      rules: [
        makeRule('builtin-ap-r1', {
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'tolerance_numeric',
          toleranceNumericMode: 'percentage',
          toleranceValue: 0.005,
          weight: 1 / 3,
        }),
        makeRule('builtin-ap-r2', {
          columnA: 'Date',
          columnB: 'Date',
          matchType: 'tolerance_date',
          toleranceValue: 3,
          weight: 1 / 3,
        }),
        makeRule('builtin-ap-r3', {
          columnA: 'Reference',
          columnB: 'Reference',
          matchType: 'exact',
          weight: 1 / 3,
        }),
      ],
    },
  },
  {
    id: 'builtin-invoice',
    name: 'Invoice Matching',
    description: 'Amount (tolerance 0.1%), Invoice Number (exact), Vendor Code (exact).',
    builtIn: true,
    config: {
      matchingType: 'oneToOne',
      minConfidenceThreshold: 0.6,
      rules: [
        makeRule('builtin-inv-r1', {
          columnA: 'Amount',
          columnB: 'Amount',
          matchType: 'tolerance_numeric',
          toleranceNumericMode: 'percentage',
          toleranceValue: 0.001,
          weight: 1 / 3,
        }),
        makeRule('builtin-inv-r2', {
          columnA: 'Invoice Number',
          columnB: 'Invoice Number',
          matchType: 'exact',
          weight: 1 / 3,
        }),
        makeRule('builtin-inv-r3', {
          columnA: 'Vendor Code',
          columnB: 'Vendor Code',
          matchType: 'exact',
          weight: 1 / 3,
        }),
      ],
    },
  },
];

export function getCustomTemplates(): SavedTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomTemplate(
  payload: { name: string; description?: string; config: MatchingConfig }
): SavedTemplate {
  const list = getCustomTemplates();
  const template: SavedTemplate = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: payload.name.trim(),
    description: payload.description?.trim() || undefined,
    config: payload.config,
    builtIn: false,
  };
  list.push(template);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return template;
}

export function deleteCustomTemplate(id: string): void {
  const list = getCustomTemplates().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getAllTemplates(): SavedTemplate[] {
  return [...BUILT_IN_TEMPLATES, ...getCustomTemplates()];
}

/** Apply a template's config and assign new rule IDs. Returns new MatchingConfig. */
export function applyTemplate(template: SavedTemplate): MatchingConfig {
  const rules: MatchingRule[] = template.config.rules.map((r) => ({
    ...r,
    id: nextRuleId(),
  }));
  return {
    rules,
    minConfidenceThreshold: template.config.minConfidenceThreshold,
    matchingType: template.config.matchingType,
  };
}

// --- Fuzzy column matching for template loading ---

const AMOUNT_KEYWORDS = ['amount', 'amt', 'sum', 'total', 'value'];
const DATE_KEYWORDS = ['date', 'dt', 'posted', 'transaction'];
const REFERENCE_KEYWORDS = ['reference', 'ref', 'number', 'num', 'invoice', 'id', 'description', 'vendor', 'code'];

function getKeywordsForTemplateColumn(templateColumn: string): string[] {
  const lower = templateColumn.toLowerCase();
  if (AMOUNT_KEYWORDS.some((k) => lower.includes(k))) return AMOUNT_KEYWORDS;
  if (DATE_KEYWORDS.some((k) => lower.includes(k))) return DATE_KEYWORDS;
  return REFERENCE_KEYWORDS;
}

/**
 * Find the best matching header for a template column name using fuzzy name matching.
 * Template "Amount" matches headers containing "amount", "amt", etc. (e.g. "InvoiceAmount").
 * Returns null if no match.
 */
export function fuzzyMatchColumn(templateColumn: string, headers: string[]): string | null {
  if (!templateColumn || headers.length === 0) return null;
  const exact = headers.find((h) => h === templateColumn);
  if (exact) return exact;
  const keywords = getKeywordsForTemplateColumn(templateColumn);
  const lower = templateColumn.toLowerCase();
  const candidates = headers.filter((h) => {
    const hLower = h.toLowerCase();
    return keywords.some((k) => hLower.includes(k));
  });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  // Prefer header that contains the template column name, then shortest match
  const withTemplate = candidates.find((h) => h.toLowerCase().includes(lower));
  if (withTemplate) return withTemplate;
  return candidates.sort((a, b) => a.length - b.length)[0] ?? null;
}

export interface AutoMapEntry {
  columnA?: { from: string; to: string };
  columnB?: { from: string; to: string };
}

/**
 * After applying a template, map rule columns to current file headers when exact match is missing.
 * Returns updated config and a map of ruleId -> auto-mapped columns (for showing "Auto-mapped from X → Y").
 */
export function applyFuzzyColumnMapping(
  config: MatchingConfig,
  headersA: string[],
  headersB: string[]
): { config: MatchingConfig; autoMaps: Record<string, AutoMapEntry> } {
  const autoMaps: Record<string, AutoMapEntry> = {};
  const rules: MatchingRule[] = config.rules.map((r) => {
    let columnA = r.columnA;
    let columnB = r.columnB;
    const entry: AutoMapEntry = {};

    if (r.columnA && !headersA.includes(r.columnA)) {
      const matched = fuzzyMatchColumn(r.columnA, headersA);
      if (matched) {
        columnA = matched;
        entry.columnA = { from: r.columnA, to: matched };
      }
    }
    if (r.columnB && !headersB.includes(r.columnB)) {
      const matched = fuzzyMatchColumn(r.columnB, headersB);
      if (matched) {
        columnB = matched;
        entry.columnB = { from: r.columnB, to: matched };
      }
    }

    if (entry.columnA || entry.columnB) autoMaps[r.id] = entry;

    return { ...r, columnA, columnB };
  });

  return {
    config: { ...config, rules },
    autoMaps,
  };
}
