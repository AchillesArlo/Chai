import { z } from 'zod';

export const OperationStatusSchema = z.enum([
  'PROCESSING',
  'SUCCEEDED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'UNKNOWN_RESULT',
]);

export type OperationStatus = z.infer<typeof OperationStatusSchema>;
