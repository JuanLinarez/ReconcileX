/**
 * API /api/nl-rules endpoint tests.
 * Mocks global.fetch to avoid real Anthropic API calls.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import handler from '../nl-rules';
import {
  createMockReq,
  createMockRes,
  mockAnthropicSuccess,
  mockAnthropicSuccessRawText,
  mockAnthropicTimeout,
} from './helpers';

const validBody = {
  instruction: 'Match by amount and date',
  headersA: ['Amount', 'Date', 'Reference'],
  headersB: ['Amount', 'TransactionDate', 'InvoiceNo'],
  sampleRowsA: [] as Record<string, string>[],
  sampleRowsB: [] as Record<string, string>[],
};

describe('api/nl-rules', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  describe('1. Successful rule generation', () => {
    it('should return 200 with config.rules', async () => {
      mockAnthropicSuccess({
        config: {
          rules: [
            { columnA: 'Amount', columnB: 'Amount', matchType: 'tolerance_numeric', weight: 0.5 },
            { columnA: 'Date', columnB: 'TransactionDate', matchType: 'tolerance_date', weight: 0.5 },
          ],
          minConfidenceThreshold: 0.7,
          matchingType: 'oneToOne',
        },
        explanation: 'Matched amount and date columns.',
      });
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(200);
      const body = res.body as { config?: { rules?: unknown[] } };
      expect(body.config?.rules).toBeDefined();
      expect(body.config!.rules!.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Method not allowed', () => {
    it('should return 405 for GET request', async () => {
      const req = createMockReq({ method: 'GET' });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(405);
    });
  });

  describe('3. Missing required fields', () => {
    it('should return 400 when instruction is missing', async () => {
      const req = createMockReq({
        body: {
          headersA: ['Amount'],
          headersB: ['Total'],
          sampleRowsA: [],
          sampleRowsB: [],
        },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('4. Weight normalization', () => {
    it('should normalize weights to sum to ~1.0', async () => {
      mockAnthropicSuccess({
        config: {
          rules: [
            { columnA: 'Amount', columnB: 'Amount', matchType: 'tolerance_numeric', weight: 0.3 },
            { columnA: 'Date', columnB: 'TransactionDate', matchType: 'tolerance_date', weight: 0.3 },
            { columnA: 'Reference', columnB: 'InvoiceNo', matchType: 'exact', weight: 0.3 },
          ],
          minConfidenceThreshold: 0.7,
          matchingType: 'oneToOne',
        },
        explanation: 'Rules with weights 0.3 each.',
      });
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(200);
      const body = res.body as { config?: { rules?: Array<{ weight: number }> } };
      const sum = body.config!.rules!.reduce((s, r) => s + r.weight, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  describe('5. Column validation (invalid column)', () => {
    it('should return 422 when columnA is not in headersA', async () => {
      mockAnthropicSuccess({
        config: {
          rules: [
            { columnA: 'NonExistent', columnB: 'Amount', matchType: 'exact', weight: 1.0 },
          ],
          minConfidenceThreshold: 0.7,
          matchingType: 'oneToOne',
        },
        explanation: 'Test rule.',
      });
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(422);
      expect((res.body as { message?: string }).message).toContain('not found in Source A');
    });
  });

  describe('6. Markdown fence stripping', () => {
    it('should parse JSON wrapped in ```json ... ``` fences', async () => {
      const response = {
        config: {
          rules: [
            { columnA: 'Amount', columnB: 'Amount', matchType: 'tolerance_numeric', weight: 1.0 },
          ],
          minConfidenceThreshold: 0.7,
          matchingType: 'oneToOne',
        },
        explanation: 'Parsed from markdown.',
      };
      mockAnthropicSuccessRawText('```json\n' + JSON.stringify(response) + '\n```');
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(200);
      const body = res.body as { config?: { rules?: unknown[] } };
      expect(body.config?.rules).toHaveLength(1);
    });
  });

  describe('7. Timeout', () => {
    it('should return 504 on AbortError', async () => {
      mockAnthropicTimeout();
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(504);
    });
  });
});
