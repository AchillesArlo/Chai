import { z } from 'zod';

import { CorrelationIdSchema, OperationIdSchema } from '../ids';

const ApiMetaSchema = z.strictObject({
  correlationId: CorrelationIdSchema,
});

const ApiFieldDetailSchema = z.strictObject({
  code: z.string().min(1).max(100),
  field: z.string().min(1).max(200),
});

export const apiSuccessEnvelopeSchema = <T extends z.ZodType>(data: T) =>
  z.strictObject({
    data,
    meta: ApiMetaSchema,
  });

export const ApiErrorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1).max(100),
    correlationId: CorrelationIdSchema,
    fieldDetails: z.array(ApiFieldDetailSchema).max(100).optional(),
    message: z.string().min(1).max(500),
    operationId: OperationIdSchema.optional(),
    retryable: z.boolean(),
  }),
});

export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;
