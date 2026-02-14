/**
 * API /api/analyze endpoint tests.
 * Mocks global.fetch to avoid real Anthropic API calls.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import handler from '../analyze';

function createMockReq(options: { method?: string; body?: unknown }): Record<string, unknown> {
  return {
    method: options.method ?? 'POST',
    body: options.body ?? {},
  };
}

function createMockRes(): {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  status: (code: number) => ReturnType<typeof createMockRes>;
  json: (data: unknown) => void;
  setHeader: (key: string, value: string) => void;
} {
  const res: {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    status: (code: number) => typeof res;
    json: (data: unknown) => void;
    setHeader: (key: string, value: string) => void;
  } = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
    setHeader(_key: string, _value: string) {
      return;
    },
  };
  return res;
}

const validBody = {
  unmatchedTransaction: {
    id: 'tx-1',
    source: 'sourceA',
    amount: 100,
    date: '2025-01-15',
    reference: 'REF-001',
    rowIndex: 1,
    raw: { Amount: '100', Date: '2025-01-15', Reference: 'REF-001' },
  },
  otherSourceTransactions: [],
  matchedTransactions: [],
  matchingRules: [{ id: 'r1', columnA: 'Amount', columnB: 'Total', matchType: 'tolerance_numeric', weight: 0.5 }],
};

function mockAnthropicSuccess(responseJson: unknown) {
  (global as unknown as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text: JSON.stringify(responseJson) }],
    }),
  });
}

function mockAnthropicTimeout() {
  (global as unknown as { fetch: typeof fetch }).fetch = vi.fn().mockImplementation(() => {
    const error = new Error('Request timed out');
    error.name = 'AbortError';
    return Promise.reject(error);
  });
}

function mockAnthropicInvalidJson() {
  (global as unknown as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text: '{ invalid": 1 }' }],
    }),
  });
}

describe('api/analyze', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  describe('1. Successful analysis', () => {
    it('should return 200 with probableCause and recommendedAction', async () => {
      mockAnthropicSuccess({
        probableCause: 'No matching amount within tolerance',
        recommendedAction: 'Increase amount tolerance to $5',
      });
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(200);
      expect((res.body as { probableCause?: string }).probableCause).toBe('No matching amount within tolerance');
      expect((res.body as { recommendedAction?: string }).recommendedAction).toBe('Increase amount tolerance to $5');
    });
  });

  describe('2. Method not allowed (GET)', () => {
    it('should return 405 for GET request', async () => {
      const req = createMockReq({ method: 'GET' });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(405);
    });
  });

  describe('3. Missing API key', () => {
    it('should return 500 when ANTHROPIC_API_KEY is not set', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(500);
      expect((res.body as { message?: string }).message).toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('4. Invalid request body (missing fields)', () => {
    it('should return 400 when unmatchedTransaction is missing', async () => {
      const req = createMockReq({
        body: {
          otherSourceTransactions: [],
          matchedTransactions: [],
          matchingRules: [],
        },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('5. Anthropic timeout', () => {
    it('should return 504 on AbortError', async () => {
      mockAnthropicTimeout();
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(504);
    });
  });

  describe('6. Anthropic returns invalid JSON', () => {
    it('should return 500 when response text is not valid JSON', async () => {
      mockAnthropicInvalidJson();
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(500);
    });
  });
});
