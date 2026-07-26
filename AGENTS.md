## Stack proyek ini

Berlaku untuk repo `Chai` dan mengalahkan deskripsi stack apa pun di `AGENTS.md` induk
(`D:\Games\Agent\AGENTS.md` adalah berkas auto-generated lintas proyek; klaimnya soal
MongoDB, MySQL, SQLite, dan Prisma **tidak berlaku di sini**).

- Runtime: Node 24, TypeScript strict, monorepo pnpm + Turborepo.
- Backend: NestJS di atas Fastify (`apps/api`). Bukan Express.
- Frontend: Next.js App Router + Tailwind (`apps/client-portal`, `apps/owner-console`).
- Basis data: **PostgreSQL saja**, diakses lewat `postgres` (postgres-js) dengan **migrasi SQL mentah**
  di `packages/database/migrations`. Tidak ada Prisma, tidak ada MongoDB/MySQL/SQLite.
- Validasi: Zod di `packages/contracts` untuk kontrak, `class-validator` + `ValidationPipe`
  (`whitelist` + `forbidNonWhitelisted`) untuk body HTTP di `apps/api`.
- Tes: vitest; suite integrasi memakai testcontainers (butuh Docker).

Invarian yang tidak boleh dilanggar ada di `README.md` bagian "Invarian". Status remediasi
terhadap blueprint ada di `docs/plans/2026-07-26-blueprint-gap-remediation.md` — baca itu sebelum
mengklaim sebuah fitur sudah jadi.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
