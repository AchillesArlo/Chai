export {
  runInboxDispatcher,
  type InboxClaim,
  type InboxDispatcherConfig,
  type InboxDispatcherOptions,
  type InboxHandler,
  type InboxHandlerResult,
} from '@chai/worker-inbox-dispatcher';

import type {
  InboxClaim,
  InboxHandler,
  InboxHandlerResult,
} from '@chai/worker-inbox-dispatcher';

/**
 * Channel worker reuses the authoritative inbox claim loop, but the domain
 * effect for a channel webhook is already applied SYNCHRONOUSLY at the API edge
 * (`ChannelsController.ingestWebhook` -> `repository.ingest`), so this async
 * stage is currently redundant. See the handler for why it refuses to ack.
 */
export function createChannelIngestHandler(): InboxHandler {
  return {
    async process(claim: InboxClaim): Promise<InboxHandlerResult> {
      // `repository.ingest` records the inbox row, runs `ingestInboundEvent`, and
      // marks it PROCESSED in ONE transaction. A committed inbox row is therefore
      // PROCESSED and never reaches this loop, because `claimInboxBatch` only
      // claims PENDING/RETRY rows.
      //
      // There is also no payload store: `chai.inbox_event` keeps only a
      // `payload_reference` + hash, not the raw event, so this worker cannot
      // reconstruct the `InboundEvent` to re-run `ingestInboundEvent` itself.
      //
      // So a claim reaching here is an event that was NOT processed inline and
      // that this worker cannot process. Acking it 'processed' would silently
      // drop it — the exact bug this fixes. We refuse: 'retry' surfaces it via the
      // dispatcher's retry -> DEAD_LETTER path so it stays visible. Wiring real
      // async processing is BLOCKED on a restricted payload store (packages/domain
      // + apps/api), which is out of this worker's file scope.
      console.warn(
        'channel-worker: refusing to ack unprocessed inbox event; domain ingest ' +
          'runs inline at the API edge and this worker has no payload store to ' +
          're-run it',
        { id: claim.id, provider: claim.provider, tenantId: claim.tenantId },
      );
      return 'retry';
    },
  };
}
