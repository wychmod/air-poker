import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['coverage', 'dist', 'node_modules', 'playwright-report', 'test-results'],
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: 'module',
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Enforce the domain/ boundary (see src/domain/README.md and doc
    // 2026-06-21-air-poker-v1-architecture.md §5). Pure game rules live
    // here; React, DOM access, and cross-layer imports are forbidden.
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'react-dom/*',
                'react/jsx-runtime',
                'react/jsx-dev-runtime',
              ],
              message:
                'domain/ must not import React. domain/ should stay pure TypeScript with no UI dependency.',
            },
            {
              group: ['src/ui/*', 'src/ui', 'src/app/*', 'src/app'],
              message:
                'domain/ must not import from ui/ or app/. Cross-layer calls go through the game reducer.',
            },
            {
              group: ['@testing-library/*'],
              message:
                'domain/ unit tests use plain Vitest. UI integration tests belong in src/tests/ or tests/e2e/.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message: 'domain/ must not access window. Use injected dependencies instead.',
        },
        {
          name: 'document',
          message: 'domain/ must not access document. Use injected dependencies instead.',
        },
        {
          name: 'localStorage',
          message: 'domain/ must not read localStorage. Persistence lives in src/app/.',
        },
        {
          name: 'sessionStorage',
          message: 'domain/ must not read sessionStorage. Persistence lives in src/app/.',
        },
        {
          name: 'fetch',
          message:
            'domain/ must not make network requests. V1 is a pure single-player browser game.',
        },
        {
          name: 'navigator',
          message: 'domain/ must not touch navigator. Use injected dependencies instead.',
        },
      ],
    },
  },
  {
    // Mirror constraint for shared setup — tests/ may import anything.
    files: ['src/tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['*.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
