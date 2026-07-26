import { z } from 'zod';

export const UuidV7Schema = z.uuidv7();

export const ActorIdSchema = UuidV7Schema.brand<'ActorId'>();
export const AggregateIdSchema = UuidV7Schema.brand<'AggregateId'>();
export const CausationIdSchema = UuidV7Schema.brand<'CausationId'>();
export const CommandIdSchema = UuidV7Schema.brand<'CommandId'>();
export const CorrelationIdSchema = UuidV7Schema.brand<'CorrelationId'>();
export const EventIdSchema = UuidV7Schema.brand<'EventId'>();
export const OperationIdSchema = UuidV7Schema.brand<'OperationId'>();
export const TenantIdSchema = UuidV7Schema.brand<'TenantId'>();

export type ActorId = z.infer<typeof ActorIdSchema>;
export type AggregateId = z.infer<typeof AggregateIdSchema>;
export type CausationId = z.infer<typeof CausationIdSchema>;
export type CommandId = z.infer<typeof CommandIdSchema>;
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;
export type OperationId = z.infer<typeof OperationIdSchema>;
export type TenantId = z.infer<typeof TenantIdSchema>;
