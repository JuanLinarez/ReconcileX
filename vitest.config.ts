import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup/vitest.setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'api/__tests__/**/*.test.ts',
    ],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: [
        'src/features/reconciliation/engine/**',
        'src/features/reconciliation/utils/**',
        'src/features/anomalies/**',
        'src/features/normalization/**',
        'src/features/matching-rules/**',
        'src/features/patterns/**',
        'src/lib/database.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/types.ts',
        '**/__tests__/**',
      ],
    },
    testTimeout: 10000,
  },
});
