import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import react from 'eslint-plugin-react';
import prettierConfig from 'eslint-config-prettier';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../scripts/eslint-plugin-phantom.js'
);
const hasPlugin = existsSync(pluginPath);
const phantomPlugin = hasPlugin
  ? (await import('../../scripts/eslint-plugin-phantom.js')).default
  : null;

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'temp', 'public'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  prettierConfig,
  {
    plugins: {
      ...(phantomPlugin ? { phantom: phantomPlugin } : {}),
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...(phantomPlugin
        ? {
            'phantom/phantom-comments': 'error',
            'phantom/no-inline-svg': 'warn',
          }
        : {}),
      // deepsource alignment
      complexity: ['error', 30],
      'object-shorthand': ['error', 'always'],
      'no-extra-boolean-cast': 'error',
      'no-unneeded-ternary': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'id-length': [
        'error',
        {
          min: 2,
          exceptions: [
            'i',
            'j',
            '_',
            'x',
            'y',
            'z',
            'C',
            'D',
            'E',
            'F',
            'G',
            'A',
            'B',
            'id',
            'ip',
            'cb',
            'fs',
            'db',
            'ms',
            'ok',
            'err',
            'req',
            'res',
            'url',
            'e',
            's',
            'v',
            'o',
            't',
            'k',
            'a',
            'd',
            'f',
          ],
        },
      ],

      // sonarjs optimizations
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/no-identical-expressions': 'off',
      'sonarjs/no-ignored-exceptions': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/slow-regex': 'off',
      'sonarjs/no-duplicated-branches': 'off',
      'sonarjs/link-with-target-blank': 'off',
      'sonarjs/void-use': 'off',

      // react optimizations
      'react/jsx-max-depth': ['error', { max: 7 }],
      'react/no-array-index-key': 'error',
      'react/jsx-boolean-value': ['error', 'never'],
      'react/prop-types': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^[A-Z_]',
          argsIgnorePattern: '^[A-Z_]',
          caughtErrorsIgnorePattern: '^[A-Z_]',
        },
      ],
      'require-await': 'error',
      'prefer-template': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'error',
      'no-template-curly-in-string': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportNamedDeclaration > VariableDeclaration[kind="let"]',
          message: 'Use "const" instead of "let" for exports.',
        },
        {
          selector: 'ExportNamedDeclaration > VariableDeclaration[kind="var"]',
          message: 'Use "const" instead of "var" for exports.',
        },
      ],
      'spaced-comment': ['error', 'always'],
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.js', 'src/temp/**/*.ts'],
    rules: {
      'id-length': 'off',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      complexity: 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-ignored-exceptions': 'off',
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/no-all-duplicated-branches': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'sonarjs/unused-import': 'off',
      'require-await': 'off',
      ...(phantomPlugin ? { 'phantom/phantom-comments': 'off' } : {}),
      'spaced-comment': 'off',
      'react/jsx-max-depth': ['error', { max: 5 }],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
