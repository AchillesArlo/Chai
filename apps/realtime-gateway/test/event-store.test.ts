import { describe, expect, it } from 'vitest';

import { decideVersionGate } from '@chai/contracts';

import { EventStore } from '../src/event-store';
import { serializeRefetchRequired, serializeServerSentEvent } from '../src/sse';

function event(id: string, type = 'message.appended') {
  return { data: { id }, event: type, id };
}

describe('realtime event store — replay and retention', () => {
  it('replays events after a cursor without duplicating visible state', async () => {
    const store = new EventStore();
    await store.append('tenant-a', event('1'));
    await store.append('tenant-a', event('2'));
    await store.append('tenant-a', event('3'));

    const replayed = await store.replay('tenant-a', '1', 100);
    expect(replayed.map((row) => row.id)).toEqual(['2', '3']);
  });

  it('returns the latest bounded window when no cursor is provided', async () => {
    const store = new EventStore();
    await store.append('tenant-a', event('1'));
    await store.append('tenant-a', event('2'));

    const latest = await store.replay('tenant-a', null, 100);
    expect(latest.map((row) => row.id)).toEqual(['1', '2']);
  });

  it('reports a gap when the cursor predates retention', async () => {
    const store = new EventStore();
    await store.append('tenant-a', event('1'));

    expect(await store.hasGap('tenant-a', 'missing')).toBe(true);
    expect(await store.hasGap('tenant-a', '1')).toBe(false);
  });

  it('trims to the bounded retention window', async () => {
    const store = new EventStore();
    for (let index = 0; index < 600; index += 1) {
      await store.append('tenant-a', event(String(index)));
    }
    // Only the last 500 are retained; an old cursor is now a gap.
    expect(await store.hasGap('tenant-a', '10')).toBe(true);
    const latest = await store.replay('tenant-a', null, 1);
    expect(latest[0]?.id).toBe('599');
  });

  it('isolates tenants — one tenant never sees another stream', async () => {
    const store = new EventStore();
    await store.append('tenant-a', event('a-1'));
    await store.append('tenant-b', event('b-1'));

    const a = await store.replay('tenant-a', null, 100);
    const b = await store.replay('tenant-b', null, 100);
    expect(a.map((row) => row.id)).toEqual(['a-1']);
    expect(b.map((row) => row.id)).toEqual(['b-1']);
  });
});

describe('SSE serialization', () => {
  it('encodes a canonical event with its aggregate version', () => {
    const frame = serializeServerSentEvent({
      aggregateId: 'conv-1',
      data: { text: 'hi' },
      event: 'message.appended',
      id: 'evt-1',
      version: 7,
    });
    expect(frame).toContain('event: message.appended');
    expect(frame).toContain('id: evt-1');
    expect(frame).toContain('"payload":{"text":"hi"}');
    expect(frame).toContain('"aggregateId":"conv-1"');
    expect(frame).toContain('"version":7');
  });

  it('still encodes an event that carries no version', () => {
    const frame = serializeServerSentEvent({
      data: { text: 'hi' },
      event: 'message.appended',
      id: 'evt-2',
    });
    expect(frame).toContain('"version":null');
    expect(frame).toContain('"payload":{"text":"hi"}');
  });

  it('encodes a refetch-required control event', () => {
    const frame = serializeRefetchRequired('cursor out of retention');
    expect(frame).toContain('event: refetch-required');
    expect(frame).toContain('control":"refetch-required');
  });
});

describe('version gating', () => {
  it('applies the first sighting and the next contiguous version', () => {
    expect(decideVersionGate(undefined, { version: 5 })).toBe('APPLY');
    expect(decideVersionGate(5, { version: 6 })).toBe('APPLY');
  });

  it('ignores a duplicate or out-of-order redelivery', () => {
    expect(decideVersionGate(6, { version: 6 })).toBe('IGNORE_STALE');
    expect(decideVersionGate(6, { version: 3 })).toBe('IGNORE_STALE');
  });

  it('demands a refetch when versions skip', () => {
    expect(decideVersionGate(6, { version: 9 })).toBe('REFETCH_REQUIRED');
  });

  it('always applies events with no version, such as presence', () => {
    expect(decideVersionGate(6, { version: undefined })).toBe('APPLY');
  });
});
