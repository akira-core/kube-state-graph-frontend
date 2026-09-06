import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      'test-results/',
      'playwright-report/',
      'blob-report/',
      '**/.eslintcache',
      'public/demo/',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'import-x': importX,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: '18.3' },
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  ...tseslint.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    files: ['src/**/*.{ts,tsx}'],
  })),

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'import-x/no-default-export': 'error',
      // Feature barrels are the intended import surface. The glob `except` form of
      // import-x/no-restricted-paths rejects `index.ts` exceptions; barrels + review
      // enforce the boundary (see spec-driven ESLint baseline).
      'import-x/no-restricted-paths': 'off',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  {
    files: ['**/*.d.ts'],
    rules: { 'import-x/no-default-export': 'off' },
  },

  {
    files: ['**/*.cjs', '**/*.mjs', 'dev/**/*'],
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },

  {
    files: [
      'vite.config.ts',
      'playwright.config.ts',
      'tailwind.config.ts',
      'postcss.config.js',
      'eslint.config.mjs',
      'dev/**/*',
      'tests/**/*',
      '**/*.test.{ts,tsx}',
    ],
    rules: {
      'import-x/no-default-export': 'off',
      'react-hooks/rules-of-hooks': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  eslintConfigPrettier,
]);
