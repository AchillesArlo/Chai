import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();

async function readJson(relativePath: string): Promise<Record<string, unknown>> {
  const contents = await readFile(join(root, relativePath), 'utf8');
  return JSON.parse(contents) as Record<string, unknown>;
}

describe('workspace structure', () => {
  it('pins the package manager and exposes the required root scripts', async () => {
    const packageJson = await readJson('package.json');
    const scripts = packageJson.scripts as Record<string, string>;
    const devDependencies = packageJson.devDependencies as Record<
      string,
      string
    >;

    expect(packageJson.private).toBe(true);
    expect(packageJson.packageManager).toBe('pnpm@11.13.1');
    expect(devDependencies.pnpm).toBe('11.13.1');
    expect(scripts).toMatchObject({
      build: 'turbo run build',
      dev: 'turbo run dev',
      lint: 'eslint . && turbo run lint',
      typecheck: 'tsc --project tsconfig.json --noEmit && turbo run typecheck',
      test: 'vitest run tests && turbo run test',
      'test:integration': 'vitest run --config vitest.integration.config.ts',
      'test:e2e': 'turbo run test:e2e',
    });
  });

  it('declares distinct owner, client, API, and realtime applications', async () => {
    const workspace = await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8');

    expect(workspace).toContain("'apps/*'");
    expect(workspace).toContain("'packages/*'");
    expect(workspace).toContain("'workers/*'");
    expect(workspace).toContain("'services/*'");

    await Promise.all(
      [
        'apps/owner-console',
        'apps/client-portal',
        'apps/api',
        'apps/realtime-gateway',
      ].map((path) => access(join(root, path))),
    );
  });

  it('enables strict TypeScript without implicit any', async () => {
    const tsconfig = await readJson('tsconfig.base.json');
    const compilerOptions = tsconfig.compilerOptions as Record<string, unknown>;

    expect(compilerOptions.strict).toBe(true);
    expect(compilerOptions.noImplicitAny).toBe(true);
    expect(compilerOptions.noUncheckedIndexedAccess).toBe(true);
  });

  it('includes root tests and configuration files in a TypeScript project', async () => {
    const tsconfig = await readJson('tsconfig.json');

    expect(tsconfig.extends).toBe('./tsconfig.base.json');
    expect(tsconfig.include).toEqual([
      'tests/**/*.ts',
      '*.config.ts',
      '*.config.mts',
    ]);
  });

  it('records exact framework and test tool versions for later milestones', async () => {
    const toolchain = await readFile(
      join(root, 'docs', 'engineering', 'TOOLCHAIN.md'),
      'utf8',
    );

    for (const pinnedVersion of [
      'Node.js | 24.12.0',
      'pnpm | 11.13.1',
      'Turborepo | 2.10.5',
      'Next.js | 16.2.10',
      'React | 19.2.7',
      'NestJS | 11.1.28',
      'Fastify | 5.10.0',
      'TypeScript | 6.0.3',
      'Vitest | 4.1.10',
      'Playwright | 1.61.1',
    ]) {
      expect(toolchain).toContain(pinnedVersion);
    }
  });
});
