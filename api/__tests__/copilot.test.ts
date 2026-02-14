/**
 * API /api/copilot endpoint tests.
 * Mocks global.fetch to avoid real Anthropic API calls.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import handler from '../copilot';

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

const validContext = {
  matchedCount: 10,
  unmatchedACount: 2,
  unmatchedBCount: 3,
  matchRate: 0.8,
  matchedAmount: 5000,
  unmatchedAmountA: 200,
  unmatchedAmountB: 300,
  sourceAName: 'Bank',
  sourceBName: 'GL',
  sourceARows: 12,
  sourceBRows: 13,
  matchingType: 'oneToOne',
  rules: [{ columnA: 'Amount', columnB: 'Total', matchType: 'tolerance_numeric', weight: 0.5 }],
  topUnmatchedA: [],
  topUnmatchedB: [],
  topMatched: [],
};

function mockAnthropicSuccess(answer: string) {
  (global as unknown as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text: answer }],
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

describe('api/copilot', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  describe('7. Successful copilot response', () => {
    it('should return 200 with answer string', async () => {
      mockAnthropicSuccess('Your match rate is 80%. Consider increasing amount tolerance.');
      const req = createMockReq({
        body: { question: 'What is my match rate?', context: validContext },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(200);
      expect((res.body as { answer?: string }).answer).toBe(
        'Your match rate is 80%. Consider increasing amount tolerance.'
      );
    });
  });

  describe('8. Method not allowed', () => {
    it('should return 405 for GET request', async () => {
      const req = createMockReq({ method: 'GET' });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(405);
    });
  });

  describe('9. Missing question field', () => {
    it('should return 400 when question is missing', async () => {
      const req = createMockReq({
        body: { context: validContext },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('10. Conversation history preserved', () => {
    it('should include conversationHistory in fetch messages', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Follow-up answer' }],
        }),
      });
      (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;

      const req = createMockReq({
        body: {
          question: 'Follow-up question',
          context: validContext,
          conversationHistory: [
            { role: 'user' as const, content: 'First question' },
            { role: 'assistant' as const, content: 'First answer' },
          ],
        },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(fetchMock).toHaveBeenCalled();
      const callBody = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
      expect(callBody.messages).toHaveLength(3);
      expect(callBody.messages[0]).toEqual({ role: 'user', content: 'First question' });
      expect(callBody.messages[1]).toEqual({ role: 'assistant', content: 'First answer' });
      expect(callBody.messages[2]).toEqual({ role: 'user', content: 'Follow-up question' });
    });
  });

  describe('11. Timeout handling', () => {
    it('should return 504 on AbortError', async () => {
      mockAnthropicTimeout();
      const req = createMockReq({
        body: { question: 'Test?', context: validContext },
      });
      const res = createMockRes();

      await handler(req as never, res as never);

      expect(res.statusCode).toBe(504);
    });
  });
});
