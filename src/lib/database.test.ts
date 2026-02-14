/**
 * Database operations unit tests.
 * Mocks @/lib/supabase to avoid real database calls.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  saveReconciliation,
  getReconciliations,
  getReconciliationStats,
  getTemplates,
  saveTemplate,
  deleteTemplate,
  recordPattern,
} from '@/lib/database';
import type { SaveReconciliationInput } from '@/lib/database';

const mockFrom = vi.fn();

function createChainableMock(resolveValue: unknown) {
  const chainable: Record<string, ReturnType<typeof vi.fn>> = {};
  const proxy = new Proxy(chainable, {
    get(_target, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => {
          queueMicrotask(() => resolve(resolveValue));
          return proxy;
        };
      }
      if (!chainable[prop]) {
        chainable[prop] = vi.fn(() => proxy);
      }
      return chainable[prop];
    },
  });
  return proxy;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const validSaveInput: SaveReconciliationInput = {
  organization_id: 'org-1',
  source_a_name: 'Bank',
  source_b_name: 'GL',
  source_a_rows: 10,
  source_b_rows: 10,
  matched_count: 8,
  unmatched_a_count: 2,
  unmatched_b_count: 2,
  match_rate: 0.8,
  matching_type: 'oneToOne',
  rules_config: { rules: [], minConfidenceThreshold: 0.7, matchingType: 'oneToOne' },
  results_summary: {},
};

const mockRecRow = {
  id: 'rec-1',
  organization_id: 'org-1',
  created_at: '2025-01-15T00:00:00Z',
  source_a_name: 'Bank',
  source_b_name: 'GL',
  source_a_rows: 10,
  source_b_rows: 10,
  matched_count: 8,
  unmatched_a_count: 2,
  unmatched_b_count: 2,
  match_rate: 0.85,
  matched_amount: 1000,
  matching_type: 'oneToOne',
  rules_config: {},
  results_summary: {},
};

describe('database', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. saveReconciliation returns id on success', () => {
    it('should return rec-123 when insert succeeds', async () => {
      mockFrom.mockReturnValue(
        createChainableMock({ data: { id: 'rec-123' }, error: null })
      );

      const result = await saveReconciliation(validSaveInput);

      expect(result).toBe('rec-123');
      expect(mockFrom).toHaveBeenCalledWith('reconciliations');
    });
  });

  describe('2. saveReconciliation returns null on error', () => {
    it('should return null when insert fails', async () => {
      mockFrom.mockReturnValue(
        createChainableMock({ data: null, error: { message: 'Insert failed' } })
      );

      const result = await saveReconciliation(validSaveInput);

      expect(result).toBeNull();
    });
  });

  describe('3. getReconciliations returns rows', () => {
    it('should return array with 2 rows', async () => {
      const mockRows = [
        { ...mockRecRow, id: 'r1' },
        { ...mockRecRow, id: 'r2' },
      ];
      mockFrom.mockReturnValue(
        createChainableMock({ data: mockRows, error: null })
      );

      const result = await getReconciliations('org-1');

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('r1');
      expect(result[1]!.id).toBe('r2');
      expect(mockFrom).toHaveBeenCalledWith('reconciliations');
    });
  });

  describe('4. getReconciliations returns empty array on error', () => {
    it('should return [] when query fails', async () => {
      mockFrom.mockReturnValue(
        createChainableMock({ data: null, error: { message: 'Query failed' } })
      );

      const result = await getReconciliations('org-1');

      expect(result).toEqual([]);
    });
  });

  describe('5. getReconciliationStats calculates correctly', () => {
    it('should return stats with total_reconciliations=3, average_match_rate=80, total_ai_analyses=5', async () => {
      const mockRecRows = [
        { ...mockRecRow, id: 'r1', match_rate: 0.8, source_a_rows: 10, source_b_rows: 10, matched_count: 8 },
        { ...mockRecRow, id: 'r2', match_rate: 0.9, source_a_rows: 10, source_b_rows: 10, matched_count: 9 },
        { ...mockRecRow, id: 'r3', match_rate: 0.7, source_a_rows: 10, source_b_rows: 10, matched_count: 7 },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'reconciliations') {
          return createChainableMock({ data: mockRecRows, error: null });
        }
        if (table === 'ai_analyses') {
          return createChainableMock({ count: 5, error: null });
        }
        return createChainableMock({ data: null, error: null });
      });

      const result = await getReconciliationStats('org-1');

      expect(result.total_reconciliations).toBe(3);
      expect(result.average_match_rate).toBeCloseTo(0.8, 5);
      expect(result.total_ai_analyses).toBe(5);
      expect(result.total_records_processed).toBe(60);
      expect(result.total_matched).toBe(24);
    });
  });

  describe('6. getTemplates returns templates', () => {
    it('should return template array', async () => {
      const mockTemplates = [
        {
          id: 't1',
          name: 'Default',
          description: null,
          config: { rules: [], minConfidenceThreshold: 0.7, matchingType: 'oneToOne' as const },
          is_default: true,
          created_at: '2025-01-15T00:00:00Z',
        },
      ];
      mockFrom.mockReturnValue(
        createChainableMock({ data: mockTemplates, error: null })
      );

      const result = await getTemplates('org-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Default');
      expect(mockFrom).toHaveBeenCalledWith('matching_templates');
    });
  });

  describe('7. saveTemplate returns created template', () => {
    it('should return template object on success', async () => {
      const createdTemplate = {
        id: 't-new',
        name: 'My Template',
        description: 'Test',
        config: { rules: [], minConfidenceThreshold: 0.7, matchingType: 'oneToOne' as const },
        is_default: false,
        created_at: '2025-01-15T00:00:00Z',
      };
      mockFrom.mockReturnValue(
        createChainableMock({ data: createdTemplate, error: null })
      );

      const result = await saveTemplate('org-1', 'user-1', {
        name: 'My Template',
        description: 'Test',
        config: { rules: [], minConfidenceThreshold: 0.7, matchingType: 'oneToOne' },
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('t-new');
      expect(result!.name).toBe('My Template');
    });
  });

  describe('8. deleteTemplate returns true on success', () => {
    it('should return true when delete succeeds', async () => {
      mockFrom.mockReturnValue(
        createChainableMock({ error: null })
      );

      const result = await deleteTemplate('t1');

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('matching_templates');
    });
  });

  describe('9. recordPattern inserts new pattern', () => {
    it('should call insert when pattern does not exist', async () => {
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createChainableMock({ data: [], error: null });
        }
        return createChainableMock({ error: null });
      });

      const result = await recordPattern('org-1', {
        pattern_type: 'column_pair_preference',
        column_a: 'Amount',
        column_b: 'Total',
      });

      expect(result).toBe(true);
    });
  });

  describe('10. recordPattern increments frequency on existing pattern', () => {
    it('should call update when pattern exists', async () => {
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createChainableMock({
            data: [{ id: 'p-1', frequency: 3 }],
            error: null,
          });
        }
        return createChainableMock({ error: null });
      });

      const result = await recordPattern('org-1', {
        pattern_type: 'column_pair_preference',
        column_a: 'Amount',
        column_b: 'Total',
      });

      expect(result).toBe(true);
    });
  });
});
