import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ApiErrorEnvelopeSchema,
  CanonicalCommandSchema,
  CanonicalEventSchema,
  OperationStatusSchema,
  TenantIdSchema,
  apiSuccessEnvelopeSchema,
} from './index';

const ids = {
  actor: '01890f47-9b3c-7cc2-98e8-1234567890ab',
  aggregate: '01890f47-9b3c-7cc2-98e8-1234567890ac',
  causation: '01890f47-9b3c-7cc2-98e8-1234567890ad',
  command: '01890f47-9b3c-7cc2-98e8-1234567890ae',
  correlation: '01890f47-9b3c-7cc2-98e8-1234567890af',
  event: '01890f47-9b3c-7cc2-98e8-1234567890b0',
  operation: '01890f47-9b3c-7cc2-98e8-1234567890b1',
  tenant: '01890f47-9b3c-7cc2-98e8-1234567890b2',
} as const;

describe('canonical identifiers', () => {
  it('accepts UUIDv7 identifiers and rejects other UUID versions', () => {
    expect(TenantIdSchema.parse(ids.tenant)).toBe(ids.tenant);
    expect(() =>
      TenantIdSchema.parse('550e8400-e29b-41d4-a716-446655440000'),
    ).toThrow();
  });
});

describe('API envelopes', () => {
  it('parses a strict success envelope', () => {
    const schema = apiSuccessEnvelopeSchema(
      z.strictObject({ tenantId: TenantIdSchema }),
    );

    expect(
      schema.parse({
        data: { tenantId: ids.tenant },
        meta: { correlationId: ids.correlation },
      }),
    ).toEqual({
      data: { tenantId: ids.tenant },
      meta: { correlationId: ids.correlation },
    });

    expect(
      schema.safeParse({
        data: { tenantId: ids.tenant },
        meta: { correlationId: ids.correlation },
        stack: 'must not cross the trust boundary',
      }).success,
    ).toBe(false);
  });

  it('parses a safe error envelope and rejects unknown fields', () => {
    const error = {
      error: {
        code: 'VERSION_CONFLICT',
        correlationId: ids.correlation,
        fieldDetails: [{ code: 'STALE', field: 'version' }],
        message: 'The resource changed. Refresh and retry.',
        operationId: ids.operation,
        retryable: false,
      },
    };

    expect(ApiErrorEnvelopeSchema.parse(error)).toEqual(error);
    expect(
      ApiErrorEnvelopeSchema.safeParse({
        error: { ...error.error, internalException: 'secret' },
      }).success,
    ).toBe(false);
  });
});

describe('canonical event envelope', () => {
  it('requires versioned aggregate and trace context', () => {
    const event = {
      actor: { id: ids.actor, type: 'USER' },
      aggregate: {
        id: ids.aggregate,
        type: 'conversation',
        version: 3,
      },
      causationId: ids.causation,
      correlationId: ids.correlation,
      data: { mode: 'HUMAN_ACTIVE' },
      eventId: ids.event,
      eventType: 'conversation.mode_changed',
      occurredAt: '2026-07-16T09:00:00.000Z',
      publishedAt: '2026-07-16T09:00:00.100Z',
      schemaVersion: 1,
      tenantId: ids.tenant,
    };

    expect(CanonicalEventSchema.parse(event)).toEqual(event);
    expect(
      CanonicalEventSchema.safeParse({ ...event, providerSecret: 'nope' })
        .success,
    ).toBe(false);
  });
});

describe('canonical command envelope', () => {
  it('requires an idempotency key and a future deadline', () => {
    const command = {
      actor: { id: ids.actor, type: 'USER' },
      commandId: ids.command,
      commandType: 'conversation.take_over',
      correlationId: ids.correlation,
      deadlineAt: '2026-07-16T09:01:00.000Z',
      expectedVersion: 2,
      idempotencyKey: 'takeover-01890f47',
      issuedAt: '2026-07-16T09:00:00.000Z',
      payload: { conversationId: ids.aggregate },
      schemaVersion: 1,
      tenantId: ids.tenant,
    };

    expect(CanonicalCommandSchema.parse(command)).toEqual(command);
    expect(
      CanonicalCommandSchema.safeParse({
        ...command,
        deadlineAt: '2026-07-16T08:59:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('operation status', () => {
  it('models uncertain delivery separately from final failure', () => {
    expect(OperationStatusSchema.options).toEqual([
      'PROCESSING',
      'SUCCEEDED',
      'FAILED_RETRYABLE',
      'FAILED_FINAL',
      'UNKNOWN_RESULT',
    ]);
    expect(OperationStatusSchema.safeParse('FAILED').success).toBe(false);
  });
});
