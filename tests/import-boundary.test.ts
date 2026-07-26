import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * Fase 4 (R-20 / GAP-009) regression: the import-boundary rules must actually
 * reject a violation, not merely exist in the config.
 *
 * Each case writes a throwaway file at the path a zone targets and lints it, so
 * the test fails if a zone's glob stops matching or a rule is dropped. Type-aware
 * linting makes this slow, hence the generous timeouts.
 */
const workspaceRoot = join(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: workspaceRoot });
const TIMEOUT_MS = 120_000;

async function boundaryMessages(
  relativePath: string,
  source: string,
): Promise<string[]> {
  const absolutePath = join(workspaceRoot, relativePath);
  writeFileSync(absolutePath, source, 'utf8');
  try {
    const results = await eslint.lintFiles([absolutePath]);
    return results.flatMap((result) =>
      result.messages
        .filter((message) => message.ruleId === 'no-restricted-imports')
        .map((message) => message.message),
    );
  } finally {
    rmSync(absolutePath, { force: true });
  }
}

describe('import boundary guard', () => {
  it(
    'rejects a connector importing the database',
    async () => {
      const messages = await boundaryMessages(
        'packages/connectors/src/boundary-guard-probe.ts',
        "import { withTenantTransaction } from '@chai/database';\nexport const probe = withTenantTransaction;\n",
      );
      expect(messages.join('\n')).toMatch(/must not touch the database/);
    },
    TIMEOUT_MS,
  );

  it(
    'rejects the policy engine importing a connector',
    async () => {
      const messages = await boundaryMessages(
        'packages/domain/src/ai-policy/boundary-guard-probe.ts',
        "import { createMockPaymentConnector } from '@chai/connectors';\nexport const probe = createMockPaymentConnector;\n",
      );
      expect(messages.join('\n')).toMatch(/decides; it never executes/);
    },
    TIMEOUT_MS,
  );

  it(
    "rejects a module importing another module's repository",
    async () => {
      const messages = await boundaryMessages(
        'apps/api/src/modules/assignment/boundary-guard-probe.ts',
        "import { PaymentsRepository } from '../payments/payments.repository';\nexport const probe = PaymentsRepository;\n",
      );
      expect(messages.join('\n')).toMatch(/Depend on a port in modules\/shared/);
    },
    TIMEOUT_MS,
  );

  it(
    'rejects frontend code importing a server-only package',
    async () => {
      const messages = await boundaryMessages(
        'apps/client-portal/src/boundary-guard-probe.ts',
        "import { withTenantTransaction } from '@chai/database';\nexport const probe = withTenantTransaction;\n",
      );
      expect(messages.join('\n')).toMatch(/reach the backend over HTTP/);
    },
    TIMEOUT_MS,
  );

  it(
    'allows an import that stays inside its own module',
    async () => {
      // A guard that blocks legitimate imports gets disabled by the next engineer.
      const messages = await boundaryMessages(
        'apps/api/src/modules/payments/boundary-guard-probe.ts',
        "import { PaymentsRepository } from './payments.repository';\nexport const probe = PaymentsRepository;\n",
      );
      expect(messages).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    'allows a module to depend on a shared port',
    async () => {
      const messages = await boundaryMessages(
        'apps/api/src/modules/assignment/boundary-guard-probe.ts',
        "import { ConversationRepository } from '../shared/conversation.port';\nexport const probe = ConversationRepository;\n",
      );
      expect(messages).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    'keeps the whole workspace free of boundary violations',
    async () => {
      // This is the actual gate: the probes prove the rules bite, this proves the
      // codebase currently satisfies them.
      const results = await eslint.lintFiles([
        'apps/api/src/**/*.ts',
        'apps/client-portal/src/**/*.{ts,tsx}',
        'apps/owner-console/src/**/*.{ts,tsx}',
        'packages/connectors/src/**/*.ts',
        'packages/domain/src/**/*.ts',
      ]);
      const violations = results.flatMap((result) =>
        result.messages
          .filter((message) => message.ruleId === 'no-restricted-imports')
          .map((message) => `${result.filePath}: ${message.message}`),
      );
      expect(violations).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
