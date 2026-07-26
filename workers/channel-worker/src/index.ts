export {
  runInboxDispatcher,
  type InboxClaim,
  type InboxDispatcherConfig,
  type InboxDispatcherOptions,
  type InboxHandler,
  type InboxHandlerResult,
} from '@chai/worker-inbox-dispatcher';

import type { InboxClaim, InboxHandler } from '@chai/worker-inbox-dispatcher';

/**
 * Channel worker reuses the authoritative inbox claim loop. The handler maps
 * payload references into domain ingest; until a payload store is wired the
 * default handler acknowledges after a no-op so the worker stays verifiable.
 */
export function createChannelIngestHandler(): InboxHandler {
  return {
    async process(claim: InboxClaim) {
      // ponytail: load claim.payloadReference → ingestInboundEvent under the
      // tenant transaction once the restricted payload store is available.
      void claim.payloadReference;
      return 'processed';
    },
  };
}
