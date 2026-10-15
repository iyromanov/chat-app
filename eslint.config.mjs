import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import web from './apps/web/eslint.config.mjs';
import contracts from './packages/contracts/eslint.config.mjs';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...web,
  ...contracts,
  prettier,
  {
    files: ['apps/web/**/*.{ts,svelte}'],
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/lines-between-class-members': [
        'error',
        'always',
        { exceptAfterSingleLine: true },
      ],
    },
  },
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        module: 'readonly',
      },
    },
    rules: {
      'no-void': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
);
