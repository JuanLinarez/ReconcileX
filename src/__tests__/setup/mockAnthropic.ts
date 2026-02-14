/**
 * Mock for Anthropic Claude API responses.
 * Used by API endpoint tests to avoid real AI calls.
 */

/** Standard successful analysis response. */
export const mockAnalyzeResponse = {
  probableCause: 'Amount difference of $2.50 exceeds the configured tolerance of $0.10.',
  suggestedMatch: {
    candidate: {
      id: 'mock-b-1',
      source: 'sourceB',
      amount: 1002.5,
      date: '2025-01-15',
      reference: 'REF-0001',
      rowIndex: 1,
      raw: { Amount: '1002.50', Date: '2025-01-15', Reference: 'REF-0001' },
    },
    reason: 'Closest match by reference and date, amount difference likely a fee.',
    confidence: 'Medium' as const,
    amountDiff: 2.5,
    dateDiffDays: 0,
    nameSimilarityPct: null,
  },
  recommendedAction: 'Increase amount tolerance to $3.00 or manually match with row 1.',
  differenceDetails: { amountDiff: 2.5, dateDiffDays: 0, referenceSimilarity: 1.0 },
};

/** Standard successful copilot response. */
export const mockCopilotResponse = {
  answer: 'Your reconciliation matched **85 out of 100** transactions (85% match rate). The largest unmatched transaction in Source A is $15,000 on row 42.',
};

/** Standard successful NL rules response. */
export const mockNlRulesResponse = {
  config: {
    rules: [
      { columnA: 'Amount', columnB: 'Amount', matchType: 'tolerance_numeric', toleranceValue: 0.01, toleranceNumericMode: 'fixed', weight: 0.4 },
      { columnA: 'Date', columnB: 'TransactionDate', matchType: 'tolerance_date', toleranceValue: 3, weight: 0.25 },
      { columnA: 'Reference', columnB: 'InvoiceNo', matchType: 'exact', weight: 0.2 },
      { columnA: 'VendorName', columnB: 'PayeeName', matchType: 'similar_text', similarityThreshold: 0.8, weight: 0.15 },
    ],
    minConfidenceThreshold: 0.7,
    matchingType: 'oneToOne',
  },
  explanation: 'Generated 4 rules prioritizing amount matching with a small tolerance for rounding differences.',
};

/** Standard successful normalize response. */
export const mockNormalizeResponse = {
  suggestions: [
    {
      issueType: 'vendor_name_variations',
      column: 'VendorName',
      mappings: [
        { original: 'J&J', normalized: 'Johnson & Johnson', confidence: 'high' as const },
        { original: 'MSFT', normalized: 'Microsoft Corporation', confidence: 'medium' as const },
      ],
      explanation: 'Standardized vendor abbreviations to full legal names.',
    },
  ],
};

/** Create a mock fetch that returns a Claude API response with the given JSON. */
export function createAnthropicFetchMock(responseJson: unknown): typeof fetch {
  return async () =>
    new Response(
      JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify(responseJson) }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

/** Create a mock fetch that returns an error. */
export function createAnthropicErrorMock(status: number, message: string): typeof fetch {
  return async () =>
    new Response(JSON.stringify({ error: { message } }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

/** Create a mock fetch that times out (aborts). */
export function createAnthropicTimeoutMock(): typeof fetch {
  return async () => {
    const error = new Error('Request timed out');
    error.name = 'AbortError';
    throw error;
  };
}
