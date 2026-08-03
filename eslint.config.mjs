import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Import-boundary guard (02 §5, GAP-009 / R-20).
 *
 * These zones are the architecture written down in a form that fails the build.
 * Previously the only thing stopping a connector from opening a database
 * connection was that nobody had tried yet.
 */
const boundaryRules = [
  {
    // A connector is an adapter around someone else's API. If it can reach the
    // database it can bypass RLS, the outbox, and the audit trail.
    files: ['packages/connectors/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@chai/database', '@chai/database/*', 'postgres', 'pg', 'pg-*'],
              message:
                'Connectors must not touch the database. Return data to the caller and let a repository persist it (02 §5).',
            },
            {
              group: ['@chai/domain', '@chai/domain/*'],
              message:
                'Connectors must not depend on domain logic; the dependency runs the other way (02 §5).',
            },
          ],
        },
      ],
    },
  },
  {
    // The policy engine decides whether a tool may run. If it can import a
    // connector it can also call one, which collapses decision and execution
    // into the same place (ADR-011).
    files: ['packages/domain/src/ai-policy/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@chai/connectors', '@chai/connectors/*', '**/connectors/**'],
              message:
                'The policy engine decides; it never executes. Keep connector imports in the execution layer (ADR-011).',
            },
          ],
        },
      ],
    },
  },
  {
    // Analytics reads a reporting surface. Pointing it at operational
    // repositories couples dashboards to write-path schemas and lets a slow
    // report contend with live traffic (02 §5, 11 §4).
    files: [
      'apps/api/src/modules/analytics/**/*.ts',
      'apps/api/src/modules/advanced-analytics/**/*.ts',
      'packages/domain/src/analytics/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/*/*.repository', '**/modules/*/postgres-*.repository'],
              message:
                'Analytics must read its own projections, not operational repositories (11 §4).',
            },
          ],
        },
      ],
    },
  },
  {
    // Modules talk through ports, never through each other's repositories. A
    // shared aggregate belongs in modules/shared as a port.
    files: ['apps/api/src/modules/**/*.ts'],
    ignores: ['apps/api/src/modules/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*/*.repository', '../*/postgres-*.repository', '../*/in-memory-*.repository'],
              message:
                "Do not import another module's repository. Depend on a port in modules/shared (02 §5).",
            },
          ],
        },
      ],
    },
  },
  {
    // Browser bundles must not be able to import server-only packages: a stray
    // import would ship credentials or a database driver to the client.
    files: ['apps/client-portal/src/**/*.{ts,tsx}', 'apps/owner-console/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@chai/database',
                '@chai/database/*',
                '@chai/domain',
                '@chai/domain/*',
                'postgres',
                'pg',
              ],
              message:
                'Frontend code must reach the backend over HTTP, never through server-only packages (02 §5).',
            },
          ],
        },
      ],
    },
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/.next/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      'scripts/**', // ponytail: pilot .mjs use node globals; lint app packages only
      '**/scripts/**', // ponytail: same as above, applies to per-package scripts/ dirs too
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // A NestJS module class is the DI token; it is supposed to be empty. The
    // rule's advice (turn it into a namespace or plain functions) would break the
    // framework, so it does not apply here.
    files: ['**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    // Test and tooling files that sit outside their package's tsconfig `include`.
    // The enabled rule set is the non-type-checked `strict` config, so linting
    // them without a program loses nothing — and keeping them out of the build
    // tsconfig is deliberate (tests must not be emitted).
    files: ['**/vitest.config.ts', '**/vitest.*.config.ts', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
  },
  ...boundaryRules,
);
