import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

/* ---------------------------------------------------------------------------
 * Clean Architecture boundaries (.claude/rules/backend.md). Dependencies point inward only:
 * domain <- application <- infrastructure / interfaces <- main. Written as no-restricted-imports
 * patterns so they catch relative and package imports alike.
 * ------------------------------------------------------------------------- */
const FRAMEWORKS = ['typeorm', 'express', 'pg', 'zod', 'jose', 'pino', 'multer'];
const frameworks = (message) => ({ group: FRAMEWORKS, message });
const layer = (name, message) => ({ group: [`**/${name}`, `**/${name}/**`], message });
const PLATFORM = {
  group: ['@estateops/platform', '@estateops/platform/*'],
  message: 'platform is for infrastructure, interfaces and main only.',
};

const restrict = (files, ...patterns) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { patterns }] },
});

export default [
  { ignores: ['node_modules', 'coverage', 'dist', 'storage'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    plugins: { import: importPlugin },
    rules: {
      'import/no-cycle': ['error', { maxDepth: Infinity }],
      'import/no-duplicates': 'error',
      'import/first': 'error',
      'no-console': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // domain: pure business rules. Only the kernel.
  restrict(
    ['services/*/src/*/domain/**/*.js'],
    layer('application', 'domain must not import application.'),
    layer('infrastructure', 'domain must not import infrastructure.'),
    layer('interfaces', 'domain must not import interfaces.'),
    layer('main', 'domain must not import main.'),
    PLATFORM,
    frameworks('domain has no framework imports.'),
  ),
  // application: use cases and ports. Domain, kernel and event names only.
  restrict(
    ['services/*/src/*/application/**/*.js'],
    layer('infrastructure', 'use cases must not import infrastructure. Depend on ports.'),
    layer('interfaces', 'use cases must not import interfaces.'),
    layer('main', 'use cases must not import main.'),
    PLATFORM,
    frameworks('use cases have no framework imports: no req, res, ORM or SQL.'),
  ),
  // infrastructure: implements ports. Never reaches into interfaces or main.
  restrict(
    ['services/*/src/*/infrastructure/**/*.js'],
    layer('interfaces', 'infrastructure must not import interfaces.'),
    layer('main', 'infrastructure must not import main.'),
  ),
  // interfaces: call use cases only. Never the database layer.
  restrict(
    ['services/*/src/*/interfaces/**/*.js'],
    layer('infrastructure', 'controllers call use cases, not infrastructure.'),
    layer('main', 'interfaces must not import main.'),
    { group: ['typeorm', 'pg'], message: 'controllers never touch the database.' },
  ),
  // services never import each other
  restrict(['services/**/*.js'], {
    group: ['@estateops/*-service', '@estateops/gateway'],
    message: 'Services never import each other. Use events or the gateway.',
  }),
  // pure packages
  restrict(['packages/kernel/src/**/*.js'], {
    group: [...FRAMEWORKS, '@estateops/*'],
    message: 'kernel is pure and has no dependencies.',
  }),
  restrict(['packages/contracts/src/**/*.js'], {
    group: ['@estateops/platform', 'typeorm', 'express', 'pg'],
    message: 'contracts is messages only.',
  }),
  prettier,
];
