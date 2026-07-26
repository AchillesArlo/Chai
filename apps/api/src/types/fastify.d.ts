import type { Principal } from '@chai/auth';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
    principal?: Principal;
    tenantContext?: {
      principalId: string;
      tenantId: string;
    };
  }
}
