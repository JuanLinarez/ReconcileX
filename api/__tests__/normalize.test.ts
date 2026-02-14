/**
 * API /api/normalize endpoint tests.
 * Mocks global.fetch to avoid real Anthropic API calls.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import handler from '../normalize';
import {
  createMockReq,
  createMockRes,
  mockAnthropicSuccess,
  mockAnthropicTimeout,
} from './helpers';

const validBody = {
  issues: [
    {
      type: 'vendor_name_variations',
      column: 'VendorName',
      sampleValues: ['J&J', 'Johnson & Johnson'],
      context: 'sourceA',
    },
  ],
  sourceAHeaders: ['Amount', 'VendorName'],
  sourceBHeaders: ['Amount', 'PayeeName'],
  sourceASample: [{ Amount: '100', VendorName: 'J&J' }],
  sourceBSample: [{ Amount: '100', PayeeName: 'Johnson & Johnson' }],
};

describe('api/normalize', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  describe('8. Successful normalization suggestions', () => {
    it('should return 200 with suggestions array', async () => {
      mockAnthropicSuccess({
        suggestions: [
          {
            issueType: 'vendor_name_variations',
            column: 'VendorName',
            mappings: [
              { original: 'J&J', normalized: 'Johnson & Johnson', confidence: 'high' as const },
            ],
            explanation: 'Standardize vendor names.',
          },
        ],
      });
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(200);
      const body = res.body as { suggestions?: unknown[] };
      expect(body.suggestions).toBeDefined();
      expect(Array.isArray(body.suggestions)).toBe(true);
    });
  });

  describe('9. Method not allowed', () => {
    it('should return 405 for GET request', async () => {
      const req = createMockReq({ method: 'GET' });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(405);
    });
  });

  describe('10. Missing required fields', () => {
    it('should return 400 when issues is missing', async () => {
      const req = createMockReq({
        body: {
          sourceAHeaders: ['Amount'],
          sourceBHeaders: ['Amount'],
          sourceASample: [],
          sourceBSample: [],
        },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('11. Timeout', () => {
    it('should return 504 on AbortError', async () => {
      mockAnthropicTimeout();
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(504);
    });
  });
});
