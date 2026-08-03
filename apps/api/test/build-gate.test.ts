import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// BUG-ESBUILD-1/2 regression gate: esbuild does not and will not support
// `emitDecoratorMetadata` (https://github.com/evanw/esbuild/issues/257).
// Without it, NestJS's DI container silently resolves constructor
// dependencies as `undefined`, and class-validator's ValidationPipe becomes
// a no-op - both fail silently at boot (no thrown error) and only surface
// as wrong behavior at request time.
//
// `app.inject()`-style vitest tests exercise the *source* TypeScript through
// vitest's own transformer (not esbuild), so they cannot catch this class of
// bug. This test builds the *real* production artifact with the *real*
// build script and drives it over a real HTTP socket, exactly like a
// deployed instance would run.
const API_ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:');
const PORT = 3099;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let serverProcess: ChildProcess | undefined;

async function waitForServer(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/service/v1/channels/mock-channel/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      // Any HTTP response (even 4xx/5xx) means the server is up and routing.
      if (response.status > 0) {
        return;
      }
    } catch {
      // Server not accepting connections yet; keep polling.
    }
    await delay(250);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

describe('production build gate (dist/main.js)', () => {
  beforeAll(async () => {
    const build = spawnSync('node', ['scripts/build.mjs'], {
      cwd: API_ROOT,
      stdio: 'pipe',
    });
    if (build.status !== 0) {
      throw new Error(
        `Production build failed: ${build.stderr.toString()}\n${build.stdout.toString()}`,
      );
    }

    serverProcess = spawn('node', ['dist/main.js'], {
      cwd: API_ROOT,
      env: {
        ...process.env,
        APP_ENV: 'test',
        PORT: String(PORT),
        CHAI_CAPABILITY_PAYMENT_ORCHESTRATION: 'true',
      },
      stdio: 'pipe',
    });

    await waitForServer(30_000);
  }, 60_000);

  afterAll(() => {
    serverProcess?.kill();
  });

  it('rejects a payment checkout body with an unknown field (ValidationPipe must run)', async () => {
    // FASE 6 removed `amount`/`currency` from CreateCheckoutBody — the server
    // resolves the amount from an invoice/order, never from client input.
    // A body still carrying `amount` must be rejected by
    // forbidNonWhitelisted, not silently accepted. If this returns 2xx,
    // ValidationPipe is a no-op in this build (BUG-ESBUILD-1 regression).
    const response = await fetch(`${BASE_URL}/api/client/v1/payments/checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-subject': 'local|client-owner',
        'idempotency-key': `build-gate-invalid-${Date.now()}`,
      },
      body: JSON.stringify({
        amount: 'not-a-number',
        currency: 'IDR',
        idempotencyKey: `build-gate-invalid-${Date.now()}`,
      }),
    });

    expect(response.status).toBe(400);
  });

  it('accepts a well-formed webhook payload and does not crash on DI (RealtimePublisher must resolve)', async () => {
    // If any controller constructor parameter without an explicit @Inject()
    // resolves to `undefined` in this build, this request crashes with a
    // 500 TypeError instead of succeeding (BUG-ESBUILD-2 regression).
    const response = await fetch(`${BASE_URL}/api/service/v1/channels/mock-channel/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        external_event_id: `build-gate-${Date.now()}`,
        external_message_id: `build-gate-msg-${Date.now()}`,
        external_user_id: '+15551234567',
        text: 'hello from build gate',
      }),
    });

    expect(response.status).toBe(201);
  });

  it('rejects a webhook payload larger than the body-size cap before parsing it (REQ-10-016)', async () => {
    // WEBHOOK_BODY_LIMIT_BYTES (webhook-body-limit.hook.ts) is 64 KiB. A
    // provider webhook is a small status notification, so a payload this
    // large has no legitimate reason to exist on this route.
    const oversizedText = 'x'.repeat(100 * 1024); // 100 KiB, over the 64 KiB cap
    const response = await fetch(`${BASE_URL}/api/service/v1/channels/mock-channel/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        external_event_id: `build-gate-oversized-${Date.now()}`,
        external_message_id: `build-gate-oversized-msg-${Date.now()}`,
        external_user_id: '+15551234567',
        text: oversizedText,
      }),
    });

    expect(response.status).toBe(413);
  });

  it('does not apply the body-size cap to a non-webhook route', async () => {
    // The cap targets provider webhook routes specifically; it must not
    // become an accidental global limit tighter than Fastify's default.
    const largeButNotWebhook = 'x'.repeat(100 * 1024);
    const response = await fetch(`${BASE_URL}/api/client/v1/payments/checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-subject': 'local|client-owner',
        'idempotency-key': `build-gate-notwebhook-${Date.now()}`,
      },
      body: JSON.stringify({
        idempotencyKey: `build-gate-notwebhook-${Date.now()}`,
        // Padding kept in an ignored field so ValidationPipe's
        // forbidNonWhitelisted still rejects it — the point here is only
        // that the response is 400 (validation), never 413 (size cap).
        notes: largeButNotWebhook,
      }),
    });

    expect(response.status).not.toBe(413);
  });
});
