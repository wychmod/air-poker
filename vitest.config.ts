import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      exclude: ['dist/**', 'src/vite-env.d.ts'],
      reporter: ['text', 'html'],
    },
    environment: 'jsdom',
    globals: true,
    passWithNoTests: true,
    setupFiles: './src/tests/setup.ts',
  },
});
