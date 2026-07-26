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
});
