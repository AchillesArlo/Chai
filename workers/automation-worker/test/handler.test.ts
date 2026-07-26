import { describe, expect, it } from 'vitest';

import { executeFollowUp } from '../src/main';
import type { FollowUpJob } from '../src/types';

function job(id: string): FollowUpJob {
  return {
    id,
    tenant_id: 'tenant-1',
    conversation_id: null,
    due_at: new Date(),
    status: 'CLAIMED',
    attempt: 0,
    max_attempts: 3,
    payload: {},
    last_error: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

describe('automation worker deployed handler', () => {
  it('refuses to complete a follow-up it cannot send (fails with a clear reason)', async () => {
    // The real send is not implemented yet (S2-4). The deployed handler must FAIL
    // the job, not silently complete it — completing un-sent work is the bug being
    // fixed. runAutomationWorker records this reason in follow_up_job.last_error.
    await expect(executeFollowUp(job('job-1'))).rejects.toThrow(/not implemented/);
  });
});
