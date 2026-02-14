/**
 * API /api/match endpoint tests.
 * For Tier 2/legacy: no fetch mock. For Tier 3: mock fetch for storage URL downloads.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import handler from '../match';
import { createMockReq, createMockRes } from './helpers';

const csvA = `Amount,Date,Reference,VendorName
1000.00,2025-01-15,REF-001,Acme Corp
2000.00,2025-01-16,REF-002,Beta LLC
3000.00,2025-01-17,REF-003,Gamma Inc`;

const csvB = `Amount,Date,Reference,VendorName
1000.00,2025-01-15,REF-001,Acme Corp
2000.00,2025-01-16,REF-002,Beta LLC
5000.00,2025-01-20,REF-999,Delta Co`;

const testConfig = {
  rules: [
    { id: 'r1', columnA: 'Amount', columnB: 'Amount', matchType: 'exact', weight: 0.5 },
    { id: 'r2', columnA: 'Reference', columnB: 'Reference', matchType: 'exact', weight: 0.5 },
  ],
  minConfidenceThreshold: 0.7,
  matchingType: 'oneToOne' as const,
};

describe('api/match', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  describe('1. Tier 2 (CSV text): Successful matching', () => {
    it('should return 200 with matched, unmatchedA, unmatchedB', async () => {
      const req = createMockReq({
        body: { csvA, csvB, config: testConfig },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(200);
      const body = res.body as { matched?: unknown[]; unmatchedA?: unknown[]; unmatchedB?: unknown[] };
      expect(body.matched).toBeDefined();
      expect(Array.isArray(body.matched)).toBe(true);
      expect(body.unmatchedA).toBeDefined();
      expect(body.unmatchedB).toBeDefined();
      expect(body.matched!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('2. Legacy (JSON rows): Successful matching', () => {
    it('should return 200 with matched results', async () => {
      const sourceA = {
        headers: ['Amount', 'Date', 'Reference'],
        rows: [
          { Amount: '1000', Date: '2025-01-15', Reference: 'REF-001' },
          { Amount: '2000', Date: '2025-01-16', Reference: 'REF-002' },
        ],
      };
      const sourceB = {
        headers: ['Amount', 'Date', 'Reference'],
        rows: [
          { Amount: '1000', Date: '2025-01-15', Reference: 'REF-001' },
          { Amount: '2000', Date: '2025-01-16', Reference: 'REF-002' },
        ],
      };
      const req = createMockReq({
        body: { sourceA, sourceB, config: testConfig },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(200);
      const body = res.body as { matched?: unknown[] };
      expect(body.matched).toBeDefined();
      expect(body.matched!.length).toBe(2);
    });
  });

  describe('3. Tier 3 (Storage URLs): Index-based response', () => {
    it('should return 200 with mode indices, matchedPairs, unmatchedIndicesA/B', async () => {
      const storageUrlA = 'https://example.com/a.csv';
      const storageUrlB = 'https://example.com/b.csv';

      (global as unknown as { fetch: typeof fetch }).fetch = vi.fn().mockImplementation((url: string) => {
        if (url === storageUrlA) {
          return Promise.resolve({ ok: true, text: async () => csvA });
        }
        if (url === storageUrlB) {
          return Promise.resolve({ ok: true, text: async () => csvB });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const req = createMockReq({
        body: {
          storageUrlA,
          storageUrlB,
          config: testConfig,
          responseMode: 'indices',
        },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        mode?: string;
        matchedPairs?: Array<{ indexA: number; indexB: number; confidence: number }>;
        unmatchedIndicesA?: number[];
        unmatchedIndicesB?: number[];
      };
      expect(body.mode).toBe('indices');
      expect(body.matchedPairs).toBeDefined();
      expect(Array.isArray(body.matchedPairs)).toBe(true);
      expect(body.unmatchedIndicesA).toBeDefined();
      expect(body.unmatchedIndicesB).toBeDefined();
    });
  });

  describe('4. Method not allowed', () => {
    it('should return 405 for GET request', async () => {
      const req = createMockReq({ method: 'GET' });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(405);
    });
  });

  describe('5. Missing config', () => {
    it('should return 400 when config is missing', async () => {
      const req = createMockReq({
        body: { csvA, csvB },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('6. Empty datasets', () => {
    it('should return 200 with 0 matched, all unmatched', async () => {
      const emptyCsv = 'Amount,Date,Reference\n';
      const req = createMockReq({
        body: { csvA: emptyCsv, csvB: emptyCsv, config: testConfig },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(200);
      const body = res.body as { matched?: unknown[]; unmatchedA?: unknown[]; unmatchedB?: unknown[] };
      expect(body.matched!.length).toBe(0);
      expect(body.unmatchedA!.length).toBe(0);
      expect(body.unmatchedB!.length).toBe(0);
    });
  });

  describe('7. Timeout on Storage URL download (Tier 3)', () => {
    it('should propagate error when fetch throws AbortError', async () => {
      const abortError = new Error('Request timed out');
      abortError.name = 'AbortError';
      (global as unknown as { fetch: typeof fetch }).fetch = vi.fn().mockRejectedValue(abortError);

      const req = createMockReq({
        body: {
          storageUrlA: 'https://example.com/a.csv',
          storageUrlB: 'https://example.com/b.csv',
          config: testConfig,
        },
      });
      const res = createMockRes();

      await expect(handler(req as never, res as never)).rejects.toThrow();
    });
  });

  describe('8. Invalid CSV format', () => {
    it('should handle malformed CSV gracefully without crashing', async () => {
      const malformedCsvA = 'not valid csv structure';
      const malformedCsvB = 'garbled text';
      const req = createMockReq({
        body: { csvA: malformedCsvA, csvB: malformedCsvB, config: testConfig },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect([200, 400, 500]).toContain(res.statusCode);
      expect(res.body).toBeDefined();
    });
  });
});
