import type { FastifyInstance } from 'fastify';

/**
 * Body-size cap for provider webhook routes (REQ-10-016, REQ-09-006,
 * REQ-09-023): `POST /api/service/v1/payments/webhook` and
 * `POST /api/service/v1/channels/:provider/webhook`. A webhook payload is a
 * small status notification — a payment or channel-message notification is
 * well under a few KB — so there is no legitimate reason for one to
 * approach Fastify's default 1 MiB body limit. Capping it tighter here
 * means an oversized payload is rejected by a header check
 * (`content-length`), before a single byte of the body is read or parsed,
 * which is cheaper than letting the default limit or JSON.parse do the
 * rejecting.
 */
export const WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;

const WEBHOOK_ROUTE_PREFIX = '/api/service/v1/';

function isWebhookRoute(url: string): boolean {
  return url.startsWith(WEBHOOK_ROUTE_PREFIX) && url.includes('webhook');
}

/**
 * Rejects a webhook request whose declared `content-length` exceeds
 * {@link WEBHOOK_BODY_LIMIT_BYTES} before the body is parsed. A request
 * without a `content-length` (chunked transfer) is not rejected here — it
 * falls through to Fastify's own body limit, which still applies.
 */
export function registerWebhookBodyLimitHook(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', (request, reply, done) => {
    if (!isWebhookRoute(request.url)) {
      done();
      return;
    }
    const contentLength = request.headers['content-length'];
    const declaredBytes = contentLength ? Number.parseInt(contentLength, 10) : NaN;
    if (Number.isFinite(declaredBytes) && declaredBytes > WEBHOOK_BODY_LIMIT_BYTES) {
      reply.code(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Webhook payload exceeds the allowed size.',
        },
      });
      return;
    }
    done();
  });
}
