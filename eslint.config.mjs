import js from '@eslint/js';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import web from './apps/web/eslint.config.mjs';
import contracts from './packages/contracts/eslint.config.mjs';

export default ts.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...web,
  ...contracts,
  prettier,
  {
    files: ['apps/web/**/*.{ts,svelte}'],
    rules: {
      'lines-between-class-members': ['error', 'always'],
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
