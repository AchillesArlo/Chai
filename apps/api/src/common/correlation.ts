import { UuidV7Schema } from '@chai/contracts';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidV7 } from 'uuid';

export function registerCorrelationHook(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', (request, reply, done) => {
    const callerCorrelationId = request.headers['x-correlation-id'];
    const parsed = UuidV7Schema.safeParse(callerCorrelationId);
    request.correlationId = parsed.success ? parsed.data : uuidV7();
    void reply.header('x-correlation-id', request.correlationId);
    done();
  });
}
