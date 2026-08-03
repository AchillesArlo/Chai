import { describe, it, expect, vi } from 'vitest';
import { RedisStreamsOutboxPublisher } from '../src/publisher';
import type { BrokerClient } from '../src/client';
import type { OutboxClaim } from '@chai/domain';

describe('Broker Backpressure & Overload Protection (REQ-02-021)', () => {
  const sampleClaim: OutboxClaim = {
    id: 'outbox-1',
    eventType: 'payment.completed',
    tenantId: 'tenant-1',
    payload: { amount: 5000 },
    attempts: 1,
    aggregateId: 'agg-1',
    aggregateType: 'payment',
    aggregateVersion: 1,
    partitionKey: 'tenant-1',
    schemaVersion: 1,
    traceparent: null,
  };

  it('handles stream overflow and trims safely using MAXLEN cap', async () => {
    let capturedMaxLen = 0;
    const mockRedis: Partial<BrokerClient> = {
      xadd: vi.fn(async (_key: string, _flag: string, _approx: string, maxLen: number) => {
        capturedMaxLen = maxLen;
        return '1600000000000-0';
      }) as unknown as BrokerClient['xadd'],
    };

    const publisher = new RedisStreamsOutboxPublisher(mockRedis as BrokerClient, { maxLen: 500 });
    const result = await publisher.publish(sampleClaim);

    expect(result).toBe('acked');
    expect(capturedMaxLen).toBe(500);
  });

  it('returns "failed" when Redis rejects the write under backpressure without crashing', async () => {
    const mockRedis: Partial<BrokerClient> = {
      xadd: vi.fn(async () => {
        throw new Error('OOM command not allowed when used memory > maxmemory');
      }) as unknown as BrokerClient['xadd'],
    };

    const publisher = new RedisStreamsOutboxPublisher(mockRedis as BrokerClient);
    const result = await publisher.publish(sampleClaim);

    expect(result).toBe('failed');
  });
});
