# Pinned Engineering Toolchain

| Tool | Version | Pinning rationale |
|---|---:|---|
| Node.js | 24.12.0 | Installed LTS runtime; satisfies current framework requirements |
| pnpm | 11.13.1 | Current stable pnpm 11; pinned through `packageManager` and local devDependency |
| Turborepo | 2.10.5 | Current stable monorepo task runner |
| Next.js | 16.2.10 | Current stable App Router framework; requires Node.js 20.9 or newer |
| React | 19.2.7 | Current stable React supported by the selected Next.js release |
| NestJS | 11.1.28 | Current stable modular server framework; requires Node.js 20 or newer |
| Fastify | 5.10.0 | Current stable HTTP adapter/runtime target |
| TypeScript | 6.0.3 | Latest TypeScript supported by `typescript-eslint` 8.64.0 |
| Vitest | 4.1.10 | Current stable unit and integration test runner |
| Playwright | 1.61.1 | Current stable browser E2E runner; installed in the UI milestone |
| ESLint | 10.7.0 | Current stable linter on Node.js 24 |
| PostgreSQL test image | 17.6-alpine | Explicit non-floating image tag for RLS integration tests |

## Compatibility Decisions

- TypeScript 7.0.2 was not selected because `typescript-eslint` 8.64.0 currently declares support below TypeScript 6.1.
- `tsx` is pinned to 4.23.1 so its compatible `esbuild` 0.28.1 dependency includes the current Windows development-server path traversal fix.
- Next.js applications are separate workspace packages and consume shared packages using `workspace:*` plus `transpilePackages` when a source package is imported directly.
- NestJS uses `@nestjs/platform-fastify`, URI API versioning, strict global validation, graceful shutdown hooks, and generated OpenAPI when the API milestone begins.
- Dependency lifecycle scripts are denied by default through `strictDepBuilds`; only `esbuild` is currently allowed to execute its install script.

## Upgrade Policy

Upgrade one compatibility group at a time. Update the lockfile, run contract and database tests, then execute root lint, typecheck, tests, integration tests, build, and dependency audit. Production container images must use explicit versions and immutable digests when images are introduced.
