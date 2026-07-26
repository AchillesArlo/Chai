import { describe, it, expect, beforeEach, vi } from 'vitest';

import type {
  IdempotentConsumer} from './consumer';
import {
  IdempotencyStore,
  createIdempotencyStore,
  createIdempotentConsumer,
  getIdempotencyStore,
  resetIdempotencyStore,
} from './consumer';

describe('IdempotencyStore', () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = createIdempotencyStore();
  });

  it('starts empty', () => {
    expect(store.has('t1', 'e1')).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('records and checks events', () => {
    store.record('t1', 'e1', 'processed');
    expect(store.has('t1', 'e1')).toBe(true);
    expect(store.size()).toBe(1);
  });

  it('isolates by tenant', () => {
    store.record('t1', 'e1', 'processed');
    expect(store.has('t1', 'e1')).toBe(true);
    expect(store.has('t2', 'e1')).toBe(false);
  });

  it('tryClaim returns true for new events', () => {
    expect(store.tryClaim('t1', 'e1')).toBe(true);
  });

  it('tryClaim returns false for existing events', () => {
    store.record('t1', 'e1', 'processed');
    expect(store.tryClaim('t1', 'e1')).toBe(false);
  });

  it('stores result data', () => {
    store.record('t1', 'e1', 'processed', { foo: 'bar' });
    const record = store.get('t1', 'e1');
    expect(record?.resultData).toEqual({ foo: 'bar' });
  });

  it('clears all records', () => {
    store.record('t1', 'e1', 'processed');
    store.record('t2', 'e2', 'processed');
    store.clear();
    expect(store.size()).toBe(0);
  });

  it('prunes expired records', () => {
    const store = new IdempotencyStore(0); // 0ms TTL = everything expired
    store.record('t1', 'e1', 'processed');
    const removed = store.prune();
    expect(removed).toBe(1);
    expect(store.size()).toBe(0);
  });
});

describe('IdempotentConsumer', () => {
  let store: IdempotencyStore;
  let consumer: IdempotentConsumer;

  beforeEach(() => {
    store = createIdempotencyStore();
    consumer = createIdempotentConsumer(store);
  });

  it('processes new events', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    const { cached, result } = await consumer.process('t1', 'e1', handler);

    expect(cached).toBe(false);
    expect(result).toBe('result');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('skips already-processed events (returns cached)', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    await consumer.process('t1', 'e1', handler);
    const { cached, result } = await consumer.process('t1', 'e1', handler);

    expect(cached).toBe(true);
    expect(result).toBe('result');
    expect(handler).toHaveBeenCalledTimes(1); // not called again
  });

  it('isolates by tenant', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    await consumer.process('t1', 'e1', handler);
    const { cached } = await consumer.process('t2', 'e1', handler);

    expect(cached).toBe(false); // different tenant, processes again
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('processWithRetry skips only successfully processed', async () => {
    let attempts = 0;
    const handler = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) throw new Error('fail');
      return 'ok';
    });

    // First attempt fails
    await expect(consumer.processWithRetry('t1', 'e1', handler)).rejects.toThrow('fail');

    // Second attempt succeeds
    const { cached, result } = await consumer.processWithRetry('t1', 'e1', handler);
    expect(cached).toBe(false);
    expect(result).toBe('ok');

    // Third attempt is cached
    const third = await consumer.processWithRetry('t1', 'e1', handler);
    expect(third.cached).toBe(true);
  });
});

describe('IdempotencyStore singleton', () => {
  beforeEach(() => {
    resetIdempotencyStore();
  });

  it('returns same instance', () => {
    expect(getIdempotencyStore()).toBe(getIdempotencyStore());
  });

  it('reset creates new instance', () => {
    const s1 = getIdempotencyStore();
    resetIdempotencyStore();
    const s2 = getIdempotencyStore();
    expect(s1).not.toBe(s2);
  });
});
