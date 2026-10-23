import fs from 'node:fs';
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

/* ---------------------------------------------------------------------------
 * Import-boundary zones (docs: section 2.2 of the brief, rules/frontend.md).
 * Written as no-restricted-imports patterns so they work on both relative and
 * "@/" alias imports. CI fails on any violation.
 * ------------------------------------------------------------------------- */
const FEATURES = fs
  .readdirSync('src/features', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const DATA = {
  group: ['**/data/**'],
  message: 'data/ is private to its feature. Use a hook; components never touch data/.',
};
const HOOK_DATA = {
  group: ['**/data/**', '!**/data/*.repository.js'],
  message: 'Hooks may import only data/<name>.repository.js.',
};
const API = {
  group: ['**/shared/api/**'],
  message: 'Only features/*/data may import shared/api (clients, DTOs, mappers).',
};
const FEATURE_DEEP = {
  group: ['**/features/*/**', '!**/features/*/index.js'],
  message: 'Import a feature only through its index.js.',
};
const OUTER = {
  group: ['**/features/**', '**/pages/**', '**/app/**'],
  message: 'shared/ must not import features, pages or app.',
};
const otherFeatures = (name) => {
  const others = FEATURES.filter((f) => f !== name);
  if (others.length === 0) return null;
  return {
    group: others.flatMap((f) => [`**/features/${f}`, `**/features/${f}/**`]),
    message: 'Features never import each other. Compose them in src/pages.',
  };
};

const restrict = (files, ...patterns) => ({
  files,
  rules: {
    'no-restricted-imports': ['error', { patterns: patterns.filter(Boolean) }],
  },
});

const featureZones = FEATURES.flatMap((f) => [
  restrict(
    [`src/features/${f}/{components,schemas,domain}/**/*.{js,jsx}`],
    DATA,
    API,
    otherFeatures(f),
  ),
  restrict([`src/features/${f}/hooks/**/*.{js,jsx}`], HOOK_DATA, API, otherFeatures(f)),
  restrict([`src/features/${f}/data/**/*.{js,jsx}`], otherFeatures(f)),
  restrict([`src/features/${f}/*.{js,jsx}`], otherFeatures(f)),
]);

/* No ad-hoc role checks and no import.meta.env outside the config module. */
const ROLE_CHECK = {
  selector:
    "BinaryExpression[operator=/^[!=]==?$/]:matches([left.property.name='role'], [right.property.name='role'], [left.name='role'], [right.name='role'])",
  message: 'No ad-hoc role checks. Use usePermission() or <Can perm=...>.',
};
const ENV_READ = {
  selector:
    "MemberExpression[object.type='MetaProperty'][object.meta.name='import'][property.name='env']",
  message: 'Read env values only through shared/config/config.js.',
};

export default [
  {
    ignores: ['dist', 'coverage', 'node_modules'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        alias: { map: [['@', './src']], extensions: ['.js', '.jsx'] },
      },
    },
    plugins: { 'react-hooks': reactHooks, import: importPlugin },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'import/no-cycle': ['error', { maxDepth: Infinity }],
      'import/no-duplicates': 'error',
      'import/first': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': ['error', ROLE_CHECK, ENV_READ],
    },
  },
  { ...react.configs.flat.recommended, files: ['**/*.{js,jsx}'] },
  { ...react.configs.flat['jsx-runtime'], files: ['**/*.{js,jsx}'] },
  { ...jsxA11y.flatConfigs.recommended, files: ['**/*.{js,jsx}'] },
  {
    files: ['src/shared/config/config.js'],
    rules: { 'no-restricted-syntax': ['error', ROLE_CHECK] },
  },

  // Zones: app / pages compose features through their public index only.
  restrict(
    ['src/pages/**/*.{js,jsx}', 'src/widgets/**/*.{js,jsx}', 'src/app/**/*.{js,jsx}'],
    DATA,
    API,
    FEATURE_DEEP,
  ),
  restrict(['src/shared/{ui,lib,i18n,config}/**/*.{js,jsx}'], API, OUTER),
  restrict(['src/shared/api/**/*.{js,jsx}'], OUTER),
  ...featureZones,

  prettier,
];
