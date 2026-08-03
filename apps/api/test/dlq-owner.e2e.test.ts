import { describe, it, expect, beforeEach } from 'vitest';
import { OwnerDlqController } from '../src/modules/dlq/owner-dlq.controller';
import { DlqRepository } from '../src/modules/dlq/dlq.repository';
import { NotFoundException } from '@nestjs/common';

describe('OwnerDlqController (REQ-06-013)', () => {
  let controller: OwnerDlqController;
  let repo: DlqRepository;

  beforeEach(() => {
    repo = new DlqRepository();
    controller = new OwnerDlqController(repo);
  });

  it('allows owner to list DLQ entries', async () => {
    repo.add({
      tenantId: 'tenant-1',
      source: 'outbox',
      eventType: 'payment.completed',
      payload: { amount: 100 },
      error: 'Connection timeout',
      attempts: 5,
      originalEventId: 'evt-1',
    });

    const result = await controller.list('tenant-1');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.eventType).toBe('payment.completed');
  });

  it('allows owner to replay a dead-lettered entry', async () => {
    const entry = repo.add({
      tenantId: 'tenant-1',
      source: 'inbox',
      eventType: 'message.created',
      payload: { text: 'Hello' },
      error: 'Processing error',
      attempts: 3,
      originalEventId: 'evt-2',
    });

    const replayRes = await controller.replay(entry.id);
    expect(replayRes.replayed).toBe(true);
    expect(repo.get(entry.id)).toBeNull();
  });

  it('throws NotFoundException on replaying non-existent entry ID', async () => {
    await expect(controller.replay('non-existent-id')).rejects.toThrow(NotFoundException);
  });
});
