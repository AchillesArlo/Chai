import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { getKillSwitchRuntime, resetKillSwitchRuntime } from '@chai/connectors/kill-switch';

import { createApplication } from '../src/bootstrap';

/**
 * REQ-08-021/FASE 4: the connector-level kill switch
 * (packages/connectors/src/kill-switch.ts) had zero production callers
 * before this — tripping it changed nothing about whether a tool actually
 * ran. This proves POST /actions/execute now checks it before touching any
 * tool with a connector-facing side effect (payment/shipment/calendar
 * prefixes), on the real production route, not just a unit test helper.
 */
describe('actions API — kill switch stops execution', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.CHAI_CAPABILITY_PAYMENT_ORCHESTRATION = 'true';
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(() => {
    delete process.env.KILL_SWITCH_PAYMENT;
    resetKillSwitchRuntime();
  });

  afterAll(async () => {
    delete process.env.CHAI_CAPABILITY_PAYMENT_ORCHESTRATION;
    await app.close();
  });

  it('stops a payment tool execution when the payment kill switch is tripped', async () => {
    process.env.KILL_SWITCH_PAYMENT = '1';
    // The runtime reads process.env live, but the DI-resolved singleton must
    // exist before the flag is read for this test's assertion to mean
    // anything against the actual route (not just the helper directly).
    expect(getKillSwitchRuntime().isTripped('payment')).toBe(true);

    const response = await app.inject({
      headers: {
        'idempotency-key': 'act-exec-killswitch',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        idempotencyKey: `exec-killswitch-${Date.now()}`,
        mode: 'AI_ACTIVE',
        origin: 'ai',
        parameters: { externalId: 'pay_does_not_matter' },
        tool: 'payment.get_status',
      },
      url: '/api/client/v1/actions/execute',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('CONNECTOR_DISABLED');
  });

  it('does not stop a tool with no connector-level kill switch (knowledge.search)', async () => {
    process.env.KILL_SWITCH_PAYMENT = '1';

    const response = await app.inject({
      headers: {
        'idempotency-key': 'act-exec-killswitch-unaffected',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        idempotencyKey: `exec-killswitch-unaffected-${Date.now()}`,
        mode: 'AI_ACTIVE',
        origin: 'ai',
        parameters: { query: 'anything', knowledgeBaseIds: [] },
        tool: 'knowledge.search',
      },
      url: '/api/client/v1/actions/execute',
    });

    // The payment kill switch must not become an accidental global switch.
    expect(response.statusCode).not.toBe(503);
  });

  it('resumes executing once the kill switch is cleared', async () => {
    process.env.KILL_SWITCH_PAYMENT = '1';
    expect(getKillSwitchRuntime().isTripped('payment')).toBe(true);

    delete process.env.KILL_SWITCH_PAYMENT;
    resetKillSwitchRuntime();
    expect(getKillSwitchRuntime().isTripped('payment')).toBe(false);

    const response = await app.inject({
      headers: {
        'idempotency-key': 'act-exec-killswitch-resume',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        idempotencyKey: `exec-killswitch-resume-${Date.now()}`,
        mode: 'AI_ACTIVE',
        origin: 'ai',
        parameters: { externalId: 'pay_does_not_exist' },
        tool: 'payment.get_status',
      },
      url: '/api/client/v1/actions/execute',
    });

    // No longer 503 — the request reaches the tool executor, which reports
    // 404 for a genuinely missing payment. Either way, not blocked by the
    // kill switch anymore.
    expect(response.statusCode).not.toBe(503);
  });
});
