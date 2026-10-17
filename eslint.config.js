import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // test-results/ and playwright-report/ hold Playwright output (the HTML report ships its own JS).
  { ignores: ['dist', 'test-results', 'playwright-report'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // Playwright e2e specs and config run in Node (the test runner), not in the browser bundle.
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Playwright fixtures with no dependencies take `{}` as their first argument (documented form).
      'no-empty-pattern': 'off',
      // Not React code: the hooks rules misread Playwright's fixture `use()` callback as a hook.
      'react-hooks/rules-of-hooks': 'off',
    },
  }
);
