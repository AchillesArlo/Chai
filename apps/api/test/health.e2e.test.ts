import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';

describe('API health', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it('returns a safe envelope and generated UUIDv7 correlation ID', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(body).toEqual({
      data: { service: 'api', status: 'ok' },
      meta: { correlationId: response.headers['x-correlation-id'] },
    });
  });

  it('preserves a valid caller correlation ID', async () => {
    const correlationId = '01890f47-9b3c-7cc2-98e8-123456789301';
    const response = await app.inject({
      headers: { 'x-correlation-id': correlationId },
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.headers['x-correlation-id']).toBe(correlationId);
    expect(response.json().meta.correlationId).toBe(correlationId);
  });

  it('rejects unknown query fields with a safe validation error', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health?unexpected=true',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        correlationId: response.headers['x-correlation-id'],
        retryable: false,
      },
    });
    expect(JSON.stringify(response.json())).not.toContain('stack');
  });

  it('formats not-found errors and publishes OpenAPI', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/v1/missing' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      error: { code: 'NOT_FOUND', retryable: false },
    });

    const openApi = await app.inject({ method: 'GET', url: '/api/openapi-json' });
    expect(openApi.statusCode).toBe(200);
    expect(openApi.json().paths).toHaveProperty('/api/v1/health');
  });
});
