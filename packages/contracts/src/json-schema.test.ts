import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CanonicalCommandSchema, CanonicalEventSchema } from './index';

describe('JSON Schema artifacts', () => {
  it('preserves strict canonical event and command boundaries', () => {
    const eventSchema = z.toJSONSchema(CanonicalEventSchema);
    const commandSchema = z.toJSONSchema(CanonicalCommandSchema);

    expect(eventSchema.additionalProperties).toBe(false);
    expect(eventSchema.required).toContain('eventId');
    expect(commandSchema.additionalProperties).toBe(false);
    expect(commandSchema.required).toContain('idempotencyKey');
  });
});
