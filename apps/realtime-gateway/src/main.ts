import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

import type { TokenConfig } from '@chai/auth';
import { startTelemetry } from '@chai/domain';
import type { ServerSentEvent } from '@chai/contracts';

import {
  authorizePublisher,
  authorizeSubscriber,
  loadRealtimeTokenConfig,
} from './auth';
import { EventStore, type RealtimeEventStore } from './event-store';
import { serializeRefetchRequired, serializeServerSentEvent } from './sse';

export interface RealtimeGatewayOptions {
  eventStore?: RealtimeEventStore;
  /** How often an open stream looks for newly appended events. */
  pollIntervalMs?: number;
  /**
   * Closes an idle stream after this long. Production keeps this high and relies
   * on heartbeats; tests set it low so an assertion does not wait on a socket.
   */
  streamTimeoutMs?: number;
  tokenConfig?: TokenConfig;
}

const REPLAY_LIMIT = 100;
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_STREAM_TIMEOUT_MS = 30 * 60 * 1000;

export function createRealtimeGateway(
  options: RealtimeGatewayOptions = {},
): FastifyInstance {
  const store: RealtimeEventStore = options.eventStore ?? new EventStore();
  const tokenConfig = options.tokenConfig ?? loadRealtimeTokenConfig();
  const pollIntervalMs = Math.max(
    10,
    Math.trunc(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS),
  );
  const streamTimeoutMs = Math.max(
    0,
    Math.trunc(options.streamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS),
  );
  const fastify = Fastify({ logger: false, trustProxy: true });

  fastify.get('/health', async () => ({ status: 'ok' }));

  /**
   * Subscribes the caller to its OWN tenant stream.
   *
   * The tenant is derived from the verified access token, never from the path or
   * a client-supplied header: a caller cannot name the tenant it wants to read
   * (blueprint 10_SECURITY §6, ADR-003, ADR-005).
   *
   * The connection stays open and drains newly appended events as they arrive,
   * with `: heartbeat` comments in between so idle proxies do not reap it.
   */
  fastify.get('/stream', async (request, reply) => {
    const subscriber = await authorizeSubscriber(
      request.headers.authorization,
      tokenConfig,
    );
    if (!subscriber.ok) {
      reply.code(subscriber.reason === 'MISSING_TOKEN' ? 401 : 403);
      return { error: { code: subscriber.reason } };
    }

    const { tenantId } = subscriber;
    const cursorHeader = request.headers['last-event-id'];
    const cursor = Array.isArray(cursorHeader) ? cursorHeader[0] : cursorHeader;

    reply.raw.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    });

    if (cursor && (await store.hasGap(tenantId, cursor))) {
      reply.raw.write(serializeRefetchRequired('cursor predates retention'));
      reply.raw.end();
      return reply;
    }

    let position = cursor ?? null;
    let closed = false;
    reply.raw.on('close', () => {
      closed = true;
    });

    const drain = async (): Promise<number> => {
      const events = await store.replay(tenantId, position, REPLAY_LIMIT);
      for (const event of events) {
        reply.raw.write(serializeServerSentEvent(event));
        position = event.id;
      }
      return events.length;
    };

    await drain();
    reply.raw.write(': connected\n\n');

    const deadline = Date.now() + streamTimeoutMs;
    while (!closed && Date.now() < deadline) {
      await sleep(pollIntervalMs);
      if (closed) break;
      const delivered = await drain();
      if (delivered === 0) {
        // Heartbeat doubles as a liveness probe: a dead socket throws here and
        // ends the loop instead of leaking a poller.
        reply.raw.write(': heartbeat\n\n');
      }
    }

    reply.raw.end();
    return reply;
  });

  /**
   * Event fan-in for the outbox dispatcher. Restricted to short-lived workload
   * tokens carrying the publish scope, because a publisher legitimately writes
   * across tenants and must therefore never be reachable by a user session.
   */
  fastify.post<{ Params: { tenantId: string } }>(
    '/publish/:tenantId',
    async (request, reply) => {
      const publisher = await authorizePublisher(
        request.headers.authorization,
        tokenConfig,
      );
      if (!publisher.ok) {
        reply.code(publisher.reason === 'MISSING_TOKEN' ? 401 : 403);
        return { error: { code: publisher.reason } };
      }

      const { tenantId } = request.params;
      const body = (request.body ?? {}) as Partial<ServerSentEvent>;
      if (!body.id || !body.event) {
        reply.code(400);
        return { error: { code: 'INVALID_EVENT' } };
      }
      const event: ServerSentEvent = {
        data: body.data ?? {},
        event: body.event,
        id: body.id,
        ...(body.aggregateId ? { aggregateId: body.aggregateId } : {}),
        ...(typeof body.version === 'number' ? { version: body.version } : {}),
      };
      await store.append(tenantId, event);
      reply.code(201);
      return { accepted: 1 };
    },
  );

  return fastify;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main(): Promise<void> {
  const telemetry = startTelemetry({
    environment: process.env.APP_ENV ?? 'production',
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'chai-realtime-gateway',
    serviceVersion: process.env.APP_VERSION ?? '0.0.0',
  });
  const port = Number.parseInt(process.env.REALTIME_PORT ?? '3010', 10);
  const app = createRealtimeGateway();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void telemetry.shutdown().finally(() => app.close());
    });
  }
  await app.listen({ host: '0.0.0.0', port });
  console.log(`realtime-gateway listening on :${port}`);
}

// ponytail: skip listen when vitest (or any importer) loads this module.
if (process.env.VITEST === undefined) {
  void main().catch((error) => {
    console.error('realtime-gateway failed', error);
    process.exitCode = 1;
  });
}
