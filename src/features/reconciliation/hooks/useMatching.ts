import { useCallback } from 'react';
import type {
  MatchingConfig,
  ReconciliationResult,
} from '../types';
import type { ParsedCsv } from '../types';
import {
  deriveColumnMappingFromRules,
  normalizeToTransactions,
  runMatching,
} from '../engine/matchingEngine';

export interface UseMatchingOptions {
  sourceA: ParsedCsv | null;
  sourceB: ParsedCsv | null;
  config: MatchingConfig;
}

export function useMatching(options: UseMatchingOptions) {
  const { sourceA, sourceB, config } = options;

  const run = useCallback((): ReconciliationResult | null => {
    if (!sourceA?.rows.length || !sourceB?.rows.length || config.rules.length === 0) return null;
    const headersA = sourceA.headers;
    const headersB = sourceB.headers;
    const { mappingA, mappingB } = deriveColumnMappingFromRules(
      config.rules,
      headersA,
      headersB
    );
    const transactionsA = normalizeToTransactions(sourceA.rows, mappingA, 'sourceA');
    const transactionsB = normalizeToTransactions(sourceB.rows, mappingB, 'sourceB');
    return runMatching(transactionsA, transactionsB, config);
  }, [sourceA, sourceB, config]);

  return { run };
}
