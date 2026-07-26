import { z } from 'zod';

import {
  ActorIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  TenantIdSchema,
} from '../ids';

const CommandActorSchema = z.strictObject({
  id: ActorIdSchema,
  type: z.enum(['USER', 'SERVICE', 'SYSTEM']),
});

export const CanonicalCommandSchema = z
  .strictObject({
    actor: CommandActorSchema,
    commandId: CommandIdSchema,
    commandType: z
      .string()
      .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)
      .max(200),
    correlationId: CorrelationIdSchema,
    deadlineAt: z.iso.datetime({ offset: true }),
    expectedVersion: z.int().nonnegative().optional(),
    idempotencyKey: z
      .string()
      .min(8)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    issuedAt: z.iso.datetime({ offset: true }),
    payload: z.record(z.string(), z.unknown()),
    schemaVersion: z.int().positive(),
    tenantId: TenantIdSchema,
  })
  .refine(
    ({ deadlineAt, issuedAt }) =>
      Date.parse(deadlineAt) > Date.parse(issuedAt),
    {
      message: 'deadlineAt must be after issuedAt',
      path: ['deadlineAt'],
    },
  );

export type CanonicalCommand = z.infer<typeof CanonicalCommandSchema>;
