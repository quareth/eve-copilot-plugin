import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'eqeqeq': ['error', 'always'],
      'no-console': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/capabilities/generated/**'],
    rules: {
      'max-lines': ['error', { max: 900, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['node:*', '@modelcontextprotocol/*', 'better-sqlite3', 'zod'], message: 'Domain code must be dependency-free.' },
          { regex: '^\\.\\./', message: 'Domain dependencies must point inward.' },
        ],
      }],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            regex: '^\\.\\./(?:\\.\\./)*(?:mcp|storage|config|bootstrap|platform)(?:/|$)',
            message: 'Application code must depend on ports, DTOs, and domain only.',
          },
        ],
      }],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'plugins/*/scripts/**/*.mjs'],
    languageOptions: tseslint.configs.disableTypeChecked.languageOptions,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'no-console': 'off',
    },
  },
);
