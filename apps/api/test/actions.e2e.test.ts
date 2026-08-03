import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';

describe('actions API — tool policy', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it('denies AI tools while HUMAN_ACTIVE', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'act-human-block',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        mode: 'HUMAN_ACTIVE',
        origin: 'ai',
        parameters: {},
        tool: 'knowledge.search',
      },
      url: '/api/client/v1/actions/evaluate',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('AI_OUTBOUND_BLOCKED');
  });

  it('allows safe AI tools while AI_ACTIVE', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'act-allow',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        mode: 'AI_ACTIVE',
        origin: 'ai',
        parameters: { query: 'jam buka' },
        tool: 'knowledge.search',
      },
      url: '/api/client/v1/actions/evaluate',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.kind).toBe('allow');
  });

  it('returns require_approval for high-risk tools', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'act-risk',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        mode: 'AI_ACTIVE',
        origin: 'ai',
        parameters: { amount: 1000 },
        tool: 'payment.charge',
      },
      url: '/api/client/v1/actions/evaluate',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.kind).toBe('require_approval');
  });

  it('/execute rejects a tool unknown to the catalog (fails closed, not treated as safe)', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'act-exec-unknown',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        idempotencyKey: 'exec-unknown-tool-key',
        mode: 'AI_ACTIVE',
        origin: 'ai',
        parameters: {},
        tool: 'not-a-real-tool',
      },
      url: '/api/client/v1/actions/execute',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('UNKNOWN_TOOL');
  });

  it('/execute actually runs a LOW-risk AI tool and returns a SUCCEEDED ActionRequest', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'act-exec-search',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        idempotencyKey: `exec-search-${Date.now()}`,
        mode: 'AI_ACTIVE',
        origin: 'ai',
        parameters: { query: 'jam buka', knowledgeBaseIds: [] },
        tool: 'knowledge.search',
      },
      url: '/api/client/v1/actions/execute',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.status).toBe('SUCCEEDED');
    expect(body.tool).toBe('knowledge.search');
  });

  it('/execute does not run a tool the policy engine denies (no side effect for HUMAN_ACTIVE + AI origin)', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'act-exec-denied',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        idempotencyKey: 'exec-denied-key',
        mode: 'HUMAN_ACTIVE',
        origin: 'ai',
        parameters: { query: 'anything' },
        tool: 'knowledge.search',
      },
      url: '/api/client/v1/actions/execute',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('AI_OUTBOUND_BLOCKED');

    // A denied request must never reach the repository — repeating the same
    // idempotency key with a mode that WOULD be allowed must still execute,
    // proving no ActionRequest row was created for the denied attempt.
    const retry = await app.inject({
      headers: {
        'idempotency-key': 'act-exec-denied-retry',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        idempotencyKey: 'exec-denied-key',
        mode: 'AI_ACTIVE',
        origin: 'ai',
        parameters: { query: 'anything' },
        tool: 'knowledge.search',
      },
      url: '/api/client/v1/actions/execute',
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data.status).toBe('SUCCEEDED');
  });

  it('/execute refuses a catalog tool with no wired executor instead of pretending to run it', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'act-exec-notimpl',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        approvedBy: '01890f47-9b3c-7cc2-98e8-1234567892ff',
        confirmed: true,
        idempotencyKey: 'exec-notimpl-key',
        mode: 'HUMAN_ACTIVE',
        origin: 'human',
        parameters: {},
        tool: 'appointment.reschedule',
      },
      url: '/api/client/v1/actions/execute',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('TOOL_NOT_IMPLEMENTED');
  });
});
