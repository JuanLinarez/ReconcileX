/**
 * Vitest global setup for ReconcileX tests.
 * - Mocks Supabase to prevent real database calls
 * - Sets test environment variables
 */
import { vi, beforeEach } from 'vitest';
import { resetIdCounter } from '../factories/transactionFactory';

// Reset transaction ID counter before each test for predictable IDs
beforeEach(() => {
  resetIdCounter();
});

// Mock environment variables that API endpoints expect
vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key-not-real');
vi.stubEnv('NODE_ENV', 'test');
