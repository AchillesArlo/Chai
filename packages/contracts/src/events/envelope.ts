import { z } from 'zod';

import {
  ActorIdSchema,
  AggregateIdSchema,
  CausationIdSchema,
  CorrelationIdSchema,
  EventIdSchema,
  TenantIdSchema,
} from '../ids';

const ActorSchema = z.strictObject({
  id: ActorIdSchema,
  type: z.enum(['USER', 'SERVICE', 'SYSTEM', 'PROVIDER', 'AI']),
});

const AggregateSchema = z.strictObject({
  id: AggregateIdSchema,
  type: z.string().regex(/^[a-z][a-z0-9_]*$/).max(100),
  version: z.int().nonnegative(),
});

export const CanonicalEventSchema = z.strictObject({
  actor: ActorSchema,
  aggregate: AggregateSchema,
  causationId: CausationIdSchema,
  correlationId: CorrelationIdSchema,
  data: z.record(z.string(), z.unknown()),
  eventId: EventIdSchema,
  eventType: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/).max(200),
  occurredAt: z.iso.datetime({ offset: true }),
  publishedAt: z.iso.datetime({ offset: true }),
  schemaVersion: z.int().positive(),
  tenantId: TenantIdSchema,
});

export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;
