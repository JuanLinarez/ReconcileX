/**
 * Mock for Supabase client.
 * Prevents real DB calls during tests.
 */
import { vi } from 'vitest';

/** Creates a chainable mock that mimics Supabase's query builder pattern. */
function createChainableMock(resolveValue: unknown = { data: [], error: null }) {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};
  const chainable = new Proxy(mock, {
    get(_target, prop: string) {
      if (prop === 'then') {
        // Make it thenable so await works
        return (resolve: (v: unknown) => void) => resolve(resolveValue);
      }
      if (!mock[prop]) {
        mock[prop] = vi.fn(() => chainable);
      }
      return mock[prop];
    },
  });
  return chainable;
}

/** Default mock of the Supabase client. */
export function createMockSupabaseClient() {
  return {
    from: vi.fn(() => createChainableMock()),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test/file.csv' }, error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.com/signed' }, error: null }),
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    },
  };
}

/** Install the Supabase mock globally. Call in vitest.setup.ts. */
export function installSupabaseMock(): void {
  const mockClient = createMockSupabaseClient();
  vi.mock('@/lib/supabase', () => ({
    supabase: mockClient,
  }));
}
