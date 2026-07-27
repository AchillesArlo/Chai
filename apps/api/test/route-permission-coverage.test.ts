import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * R-03 fail-closed enforcement.
 *
 * Blueprint GAP-001 requires every route and mutation to map to a typed
 * permission. This test enumerates every HTTP handler in the API and fails when
 * one is neither annotated with `@RequirePermission` (on the method or its
 * controller class) nor listed below as deliberately public.
 *
 * The allowlist is the contract: adding a route without a permission is a
 * conscious, reviewable act, not an oversight.
 */

const HTTP_METHOD = /^\s*@(Get|Post|Put|Patch|Delete)\(/;
const CLASS_DECLARATION = /^export class (\w+)/;
const REQUIRE_PERMISSION = /^\s*@RequirePermission\(/;

/**
 * Routes that must stay reachable without a tenant permission.
 *
 * - auth: issuing or inspecting a session cannot itself require a session.
 * - health: liveness probe for the load balancer.
 * - provider webhooks: authenticated by signature, not by user permission
 *   (blueprint 10_SECURITY §9).
 * - widget visitor session: end customers have no account (01_PRODUCT_SCOPE §4).
 */
const PUBLIC_ROUTES = new Set<string>([
  'auth/login.controller.ts:login',
  'auth/login.controller.ts:refresh',
  'auth/login.controller.ts:logout',
  'auth/session.controller.ts:session',
  'health/health.controller.ts:health',
  'modules/channels/channels.controller.ts:ingestWebhook',
  'modules/payments/payments.controller.ts:webhook',
  'modules/widget/widget.controller.ts:listSessions',
  'modules/widget/widget.controller.ts:getSession',
  'modules/widget/widget.controller.ts:createSession',
  'modules/widget/widget.controller.ts:updateSession',
]);

interface RouteRecord {
  file: string;
  line: number;
  decorator: string;
  handler: string;
  className: string;
  covered: boolean;
}

async function listControllerFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listControllerFiles(path)));
    } else if (entry.name.endsWith('.controller.ts')) {
      files.push(path);
    }
  }
  return files;
}

/** True when the handler or its enclosing class carries @RequirePermission. */
function collectRoutes(relativePath: string, source: string): RouteRecord[] {
  const lines = source.split(/\r?\n/);
  const classHasPermission = new Map<string, boolean>();

  let pendingPermission = false;
  for (const line of lines) {
    if (REQUIRE_PERMISSION.test(line)) {
      pendingPermission = true;
      continue;
    }
    const declaration = CLASS_DECLARATION.exec(line);
    if (declaration?.[1]) {
      classHasPermission.set(declaration[1], pendingPermission);
      pendingPermission = false;
      continue;
    }
    // Any non-decorator, non-blank line ends a decorator block.
    if (!line.trimStart().startsWith('@') && line.trim() !== '') {
      pendingPermission = false;
    }
  }

  const routes: RouteRecord[] = [];
  let currentClass = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    const declaration = CLASS_DECLARATION.exec(line);
    if (declaration?.[1]) {
      currentClass = declaration[1];
    }
    if (!HTTP_METHOD.test(line)) {
      continue;
    }
    // Look ahead through the contiguous decorator block for this handler, and
    // capture the handler name so the allowlist can key on it instead of a
    // line number that churns on every edit.
    let methodAnnotated = false;
    let handler = '';
    for (let ahead = index + 1; ahead < lines.length; ahead += 1) {
      const candidate = lines[ahead] as string;
      if (REQUIRE_PERMISSION.test(candidate)) {
        methodAnnotated = true;
        continue;
      }
      if (candidate.trimStart().startsWith('@') || candidate.trim() === '') {
        continue;
      }
      const signature = /^\s*(?:async\s+)?(\w+)\s*\(/.exec(candidate);
      handler = signature?.[1] ?? '';
      break;
    }
    // The class name appears after its decorators, so resolve it lazily.
    let owningClass = currentClass;
    if (!owningClass) {
      for (let ahead = index; ahead < lines.length; ahead += 1) {
        const declared = CLASS_DECLARATION.exec(lines[ahead] as string);
        if (declared?.[1]) {
          owningClass = declared[1];
          break;
        }
      }
    }
    routes.push({
      className: owningClass,
      covered: methodAnnotated || classHasPermission.get(owningClass) === true,
      decorator: line.trim(),
      file: relativePath,
      handler,
      line: index + 1,
    });
  }
  return routes;
}

function isPublic(route: RouteRecord): boolean {
  return PUBLIC_ROUTES.has(`${route.file}:${route.handler}`);
}

describe('every API route maps to a permission', () => {
  it('has no handler without @RequirePermission outside the public allowlist', async () => {
    const sourceRoot = join(process.cwd(), 'src');
    const files = await listControllerFiles(sourceRoot);
    expect(files.length).toBeGreaterThan(0);

    const flattened: RouteRecord[] = [];
    for (const file of files) {
      const relativePath = file
        .slice(sourceRoot.length + 1)
        .split('\\')
        .join('/');
      flattened.push(...collectRoutes(relativePath, await readFile(file, 'utf8')));
    }
    // Sanity floor: the walker must find the bulk of the API surface, guarding
    // against a file-walk bug that silently returns nothing. Recalibrated from
    // 300 to 250 after D2 removed the redundant in-memory facade modules
    // (outbox, command-event, payment-state-machine, shipment-state-machine,
    // job-queue = 57 routes). The real guard below — every route maps to a
    // permission — is unchanged.
    expect(flattened.length).toBeGreaterThan(250);

    const offenders = flattened
      .filter((route) => !route.covered)
      .filter((route) => !isPublic(route))
      .map((route) => `${route.file}:${route.line} ${route.decorator}`);

    expect(offenders).toEqual([]);
  });

  it('keeps the public allowlist minimal and honest', async () => {
    // Guards against the allowlist quietly becoming the escape hatch.
    expect(PUBLIC_ROUTES.size).toBeLessThanOrEqual(12);
  });
});
