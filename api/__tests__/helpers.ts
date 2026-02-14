/**
 * Shared test helpers for API endpoint tests.
 */
import { vi } from 'vitest';

export function createMockReq(options: { method?: string; body?: unknown }): Record<string, unknown> {
  return {
    method: options.method ?? 'POST',
    body: options.body ?? {},
  };
}

export function createMockRes(): {
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

export function mockAnthropicSuccess(responseJson: unknown) {
  (global as unknown as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text: JSON.stringify(responseJson) }],
    }),
  });
}

export function mockAnthropicSuccessRawText(text: string) {
  (global as unknown as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text }],
    }),
  });
}

export function mockAnthropicTimeout() {
  (global as unknown as { fetch: typeof fetch }).fetch = vi.fn().mockImplementation(() => {
    const error = new Error('Request timed out');
    error.name = 'AbortError';
    return Promise.reject(error);
  });
}
