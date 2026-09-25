import type { Linter } from 'eslint';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * AGENTS.md §2.1 / §15: `Math.random()` is forbidden everywhere. Randomness comes only from the
 * secure RNG in `src/core/rng`. Exported so tests can assert the rule stays configured.
 */
export const mathRandomBan = {
  'no-restricted-properties': [
    'error',
    {
      object: 'Math',
      property: 'random',
      message: 'Math.random() is forbidden (AGENTS.md §2.1). Use the SecureRng from src/core/rng.',
    },
  ],
} satisfies Linter.RulesRecord;

const ENGINE_MESSAGE =
  'src/ai must not import engine internals (AGENTS.md §8.1). NPCs receive only a PlayerView.';

/**
 * AGENTS.md §8.1: the AI consumes only `PlayerView` and returns an `Action`. It must not reach the
 * engine (deck, hidden cards) or any layer above the core.
 */
export const aiImportRestrictions = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['**/core/engine', '**/core/engine/**'], message: ENGINE_MESSAGE },
        {
          group: [
            '**/ui',
            '**/ui/**',
            '**/app',
            '**/app/**',
            '**/history',
            '**/history/**',
            '**/workers',
            '**/workers/**',
          ],
          message:
            'src/ai is pure decision logic and must not depend on UI, app, history or workers.',
        },
        {
          group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
          message: 'src/ai is framework-agnostic.',
        },
      ],
    },
  ],
} satisfies Linter.RulesRecord;

/** AGENTS.md §4: `src/core` is pure TypeScript with zero DOM/React imports and no upward deps. */
export const coreImportRestrictions = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'zustand', 'zustand/*'],
          message: 'src/core must stay framework-agnostic (AGENTS.md §4).',
        },
        {
          group: [
            '**/ai',
            '**/ai/**',
            '**/ui',
            '**/ui/**',
            '**/app',
            '**/app/**',
            '**/history',
            '**/history/**',
            '**/workers',
            '**/workers/**',
            '**/i18n',
            '**/i18n/**',
          ],
          message: 'src/core must not depend on higher layers (AGENTS.md §4).',
        },
      ],
    },
  ],
} satisfies Linter.RulesRecord;

/**
 * AGENTS.md §2.7 / §15: user-facing strings live in `src/i18n`. JSX text containing letters is
 * rejected in UI code; render strings from the i18n module instead.
 */
export const jsxLiteralBan = {
  'no-restricted-syntax': [
    'error',
    {
      selector: 'JSXText[value=/[A-Za-zÀ-ÿ]/]',
      message: 'User-facing text must come from src/i18n (AGENTS.md §2.7).',
    },
  ],
} satisfies Linter.RulesRecord;

export default defineConfig(
  globalIgnores([
    'dist',
    'dev-dist',
    'coverage',
    'test-results',
    'playwright-report',
    'blob-report',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...mathRandomBan,
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/ui/**/*.tsx', 'src/app/**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    rules: jsxLiteralBan,
  },
  {
    files: ['src/core/**/*.ts'],
    rules: coreImportRestrictions,
  },
  {
    files: ['src/ai/**/*.ts'],
    rules: aiImportRestrictions,
  },
  {
    files: ['*.config.ts', 'scripts/**/*.ts', 'tests/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
