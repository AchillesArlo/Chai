

# Project Memory — Chai
> 132 notes | Score threshold: >40

## Safety — Never Run Destructive Commands

> Dangerous commands are actively monitored.
> Critical/high risk commands trigger error notifications in real-time.

- **NEVER** run `rm -rf`, `del /s`, `rmdir`, `format`, or any command that deletes files/directories without EXPLICIT user approval.
- **NEVER** run `DROP TABLE`, `DELETE FROM`, `TRUNCATE`, or any destructive database operation.
- **NEVER** run `git push --force`, `git reset --hard`, or any command that rewrites history.
- **NEVER** run `npm publish`, `docker rm`, `terraform destroy`, or any irreversible deployment/infrastructure command.
- **NEVER** pipe remote scripts to shell (`curl | bash`, `wget | sh`).
- **ALWAYS** ask the user before running commands that modify system state, install packages, or make network requests.
- When in doubt, **show the command first** and wait for approval.

**Stack:** TypeScript · Fastify + Next.js + React + Tailwind · DB: PostgreSQL, Redis

## 📝 NOTE: 1 uncommitted file(s) in working tree.\n\n## Important Warnings

- **Low cohesion detected in Domain Cluster 10** — Cluster 10 (40 nodes) has a very low cohesion score (0.04). This sugge
- **Low cohesion detected in Domain Cluster 257** — Cluster 257 (14 nodes) has a very low cohesion score (0.07). This sugg
- **Low cohesion detected in Domain Cluster 244** — Cluster 244 (15 nodes) has a very low cohesion score (0.07). This sugg
- **Low cohesion detected in Domain Cluster 232** — Cluster 232 (26 nodes) has a very low cohesion score (0.06). This sugg
- **Low cohesion detected in Domain Cluster 196** — Cluster 196 (34 nodes) has a very low cohesion score (0.03). This sugg
- **Low cohesion detected in Domain Cluster 174** — Cluster 174 (11 nodes) has a very low cohesion score (0.09). This sugg

## Active: `docs/plans`

- **🟢 Edited docs/plans/2026-07-29-daftar-masalah-untuk-agen-lanjutan.md (5 changes, 191min)**

## Project Standards

- convention in .gitignore
- Version your API from day 1 (/api/v1/)
- Use consistent response format across all endpoints
- Implement soft delete for important data — don't hard delete without confirmation
- Handle timezone correctly — store UTC, display in user's timezone
- Make layouts responsive from the start — mobile-first approach
- Disable submit button during form submission — prevent double-submit
- Always add empty states ("No items yet" with call-to-action)

## Learned Patterns

- Avoid: Low cohesion detected in Domain Cluster 102 (seen 4x)
- Avoid: Low cohesion detected in Domain Cluster 103 (seen 6x)
- Avoid: Low cohesion detected in Domain Cluster 1 (seen 12x)
- Agent generates new migration for every change (squash related changes)
- Agent installs packages without checking if already installed

### 📚 Core Framework Rules: [callstackincubator/react-native-best-practices]
# React Native Best Practices

## Overview

Performance optimization guide for React Native applications, covering JavaScript/React, Native (iOS/Android), and bundling optimizations. Based on Callstack's "Ultimate Guide to React Native Optimization".

## Skill Format

Each reference file follows a hybrid format for fast lookup and deep understanding:

- **Quick Pattern**: Incorrect/Correct code snippets for immediate pattern matching
- **Quick Command**: Shell commands for process/measurement skills
- **Quick Config**: Configuration snippets for setup-focused skills
- **Quick Reference**: Summary tables for conceptual skills
- **Deep Dive**: Full context with When to Use, Prerequisites, Step-by-Step, Common Pitfalls

**Impact ratings**: CRITICAL (fix immediately), HIGH (significant improvement), MEDIUM (worthwhile optimization)

## When to Apply

Reference these guidelines when:
- Debugging slow/janky UI or animations
- Investigating memory leaks (JS or native)
- Optimizing app startup time (TTI)
- Reducing bundle or app size
- Writing native modules (Turbo Modules)
- Profiling React Native performance
- Reviewing React Native code for performance

## Security Notes

- Treat shell ...
(truncated)


### 📚 Core Framework Rules: [callstackincubator/upgrading-react-native]
# Upgrading React Native

## Overview

Covers the full React Native upgrade workflow: template diffs via Upgrade Helper, dependency updates, Expo SDK steps, and common pitfalls.

## Typical Upgrade Sequence

1. **Route**: Choose the right upgrade path via [upgrading-react-native.md][upgrading-react-native]
2. **Diff**: Fetch the canonical template diff using Upgrade Helper via [upgrade-helper-core.md][upgrade-helper-core]
3. **Dependencies**: Assess and update third-party packages via [upgrading-dependencies.md][upgrading-dependencies]
4. **React**: Align React version if upgraded via [react.md][react]
5. **Expo** (if applicable): Apply Expo SDK layer via [expo-sdk-upgrade.md][expo-sdk-upgrade]
6. **Verify**: Run post-upgrade checks via [upgrade-verification.md][upgrade-verification]



## When to Apply

Reference these guidelines when:
- Moving a React Native app to a newer version
- Reconciling native config changes from Upgrade Helper
- Validating release notes for breaking changes

## Quick Reference

| File | Description |
|------|-------------|
| [upgrading-react-native.md][upgrading-react-native] | Router: choose the right upgrade path |
| [upgrade-helper-core.md][upgrade-he...
(truncated)


### 📚 Core Framework Rules: [tinybirdco/tinybird-typescript-sdk-guidelines]
# Tinybird TypeScript SDK Guidelines

Guidance for using the `@tinybirdco/sdk` package to define Tinybird resources in TypeScript with complete type inference.

## When to Apply

- Installing or configuring @tinybirdco/sdk
- Defining datasources or pipes in TypeScript
- Creating typed Tinybird clients
- Using type-safe ingestion or queries
- Running tinybird dev/build/deploy commands for TypeScript projects
- Migrating from legacy .datasource/.pipe files to TypeScript
- Defining connections (Kafka, S3, GCS)
- Creating materialized views, copy pipes, or sink pipes

## Rule Files

- `rules/getting-started.md`
- `rules/configuration.md`
- `rules/defining-datasources.md`
- `rules/defining-endpoints.md`
- `rules/typed-client.md`
- `rules/low-level-api.md`
- `rules/cli-commands.md`
- `rules/connections.md`
- `rules/materialized-views.md`
- `rules/copy-sink-pipes.md`
- `rules/tokens.md`

## Quick Reference

- Install: `npm install @tinybirdco/sdk`
- Initialize: `npx tinybird init`
- Dev mode: `tinybird dev` (uses configured `devMode`, typically branch)
- Build: `tinybird build` (builds against configured dev target)
- Deploy: `tinybird deploy` (deploys to main/production)
- Preview in CI:...
(truncated)


## File-Based Memory
> All memory is above. Write new learnings as comments.
