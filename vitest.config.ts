import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      exclude: [
        'dist/**',
        'src/vite-env.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/tests/**',
        '.idea/**',
      ],
      reporter: ['text', 'html'],
    },
    environment: 'jsdom',
    globals: true,
    passWithNoTests: true,
    setupFiles: ['./src/tests/setup.ts'],
    // Unit tests live next to source code (in-domain), so vitest must scan src/.
    // E2E tests are run separately by Playwright (see tests/e2e/).
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.git/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'tests/e2e/**',
    ],
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
