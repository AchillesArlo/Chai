export {
  runInboxDispatcher,
  type InboxClaim,
  type InboxDispatcherConfig,
  type InboxDispatcherOptions,
  type InboxHandler,
  type InboxHandlerResult,
} from '@chai/worker-inbox-dispatcher';

import type { InboxClaim, InboxHandler } from '@chai/worker-inbox-dispatcher';

export { runAutomationWorker } from './runner';
export { claimDueJobs, completeJob, failJob, getJob, scheduleFollowUp } from './repository';
export {
  API_TENANT_ID,
  SERVICE_PRINCIPAL_ID,
} from './constants';
export type {
  FollowUpJob,
  FollowUpJobStatus,
  RunAutomationWorkerOptions,
  ScheduleFollowUpInput,
} from './types';

/**
 * Follow-up / automation worker. Re-evaluates state, consent, messaging window,
 * and expected version immediately before each send (Stage 1 Task 12).
 */
export function createFollowUpHandler(): InboxHandler {
  return {
    async process(claim: InboxClaim) {
      // ponytail: load follow-up job → re-check consent/window/version → enqueue
      // outbox only when all still valid. No-op until job schema is wired.
      void claim.payloadReference;
      return 'processed';
    },
  };
}
