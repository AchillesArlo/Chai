import { describe, expect, it, vi } from 'vitest';

import { createJneAdapter } from '../connectors/jne/index.js';

function fakeFetchOk(body: unknown, status = 200) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
      status,
    }),
  ) as unknown as typeof globalThis.fetch;
}

describe('jne adapter (fallback / no api key)', () => {
  it('falls back to mock linking and reports not live', async () => {
    const adapter = createJneAdapter({ origin: 'CGK10000' });
    expect(adapter.isLive()).toBe(false);
    expect(adapter.getOrigin()).toBe('CGK10000');
    const record = await adapter.createShipment({
      consigneeCity: 'Jakarta',
      consigneeName: 'Buyer',
      consigneePhone: '0812',
      destinationZip: '10110',
      idempotencyKey: 'AWB-1',
      items: [{ qty: 1, weight: 500 }],
      service: 'REG',
      shipperName: 'Seller',
      tenantId: 'tenant-a',
    });
    expect(record.carrier).toBe('jne');
    expect(record.provider).toBe('jne');
    expect(record.trackingNumber).toBe('AWB-1');
  });

  it('respects the kill switch', async () => {
    const adapter = createJneAdapter({});
    adapter.setKillSwitch(true);
    await expect(
      adapter.createShipment({
        consigneeCity: 'c',
        consigneeName: 'n',
        consigneePhone: 'p',
        destinationZip: 'z',
        idempotencyKey: 'k',
        items: [{ qty: 1, weight: 1 }],
        service: 'REG',
        shipperName: 's',
        tenantId: 't',
      }),
    ).rejects.toThrow('LOGISTICS_KILL_SWITCH');
  });

  it('normalizes a tracking webhook into a milestone timeline', () => {
    const adapter = createJneAdapter({});
    const result = adapter.handleWebhook({
      cnote_no: 'AWB-1',
      date: '20/07/2026 10:00',
      desc: 'Paket diterima',
      status: 'DELIVERED',
      tenantId: 'tenant-a',
      tracking_number: 'AWB-1',
    });
    expect(result.verified).toBe(true);
    expect(result.record).not.toBeNull();
    expect(result.record?.status).toBe('DELIVERED');
    expect(result.record?.events).toHaveLength(1);
    expect(result.record?.events[0]?.code).toBe('DELIVERED');
  });

  it('rejects malformed webhooks', () => {
    const adapter = createJneAdapter({});
    expect(adapter.handleWebhook(null).verified).toBe(false);
    expect(adapter.handleWebhook({ status: 'DELIVERED' }).verified).toBe(false);
    expect(adapter.handleWebhook({ cnote_no: 'X' }).verified).toBe(false);
  });
});

describe('jne adapter (live / api key present)', () => {
  const apiKey = 'jne-key-123';

  it('creates a shipment and links the tracking number from JNE response', async () => {
    const captured: { body: string; headers: Headers; url: string } = {
      body: '',
      headers: new Headers(),
      url: '',
    };
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      captured.body = String(init.body);
      captured.headers = new Headers(init.headers);
      captured.url = String(url);
      return new Response(
        JSON.stringify({
          detail: [{ cnote_no: 'JNE-REAL-001', status: 'OK' }],
          status: 'success',
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      );
    }) as unknown as typeof globalThis.fetch;

    const adapter = createJneAdapter({ apiKey, origin: 'BDO10000', fetch: fetchImpl });
    expect(adapter.isLive()).toBe(true);

    const record = await adapter.createShipment({
      consigneeCity: 'Bandung',
      consigneeName: 'Buyer',
      consigneePhone: '0812',
      destinationZip: '40111',
      idempotencyKey: 'idem-1',
      items: [{ qty: 2, weight: 750 }],
      service: 'YES',
      shipperName: 'Seller',
      tenantId: 'tenant-c',
    });

    expect(record.trackingNumber).toBe('JNE-REAL-001');
    expect(record.carrier).toBe('jne');
    expect(record.provider).toBe('jne');
    expect(record.status).toBe('LINKED');
    expect(record.events[0]?.code).toBe('LINKED');
    expect(record.service).toBe('YES');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(captured.url).toBe('https://apiv2.jne.co.id:10101/tracing/api/v1/create');
    const sent = JSON.parse(captured.body);
    expect(sent.API_KEY).toBe(apiKey);
    expect(sent.OLSHIP_SERVICE).toBe('YES');
    expect(sent.OLSHIP_WEIGHT).toBe('1500');
    expect(sent.id).toBe('idem-1');
    expect(captured.headers.get('Idempotency-Key')).toBe('idem-1');
  });

  it('throws on non-ok create response', async () => {
    const fetchImpl = fakeFetchOk({ message: 'invalid service' }, 400);
    const adapter = createJneAdapter({ apiKey, fetch: fetchImpl });
    await expect(
      adapter.createShipment({
        consigneeCity: 'c',
        consigneeName: 'n',
        consigneePhone: 'p',
        destinationZip: 'z',
        idempotencyKey: 'k',
        items: [{ qty: 1, weight: 1 }],
        service: 'BAD',
        shipperName: 's',
        tenantId: 't',
      }),
    ).rejects.toThrow('JNE_CREATE_FAILED');
  });

  it('tracks a shipment and orders events chronologically', async () => {
    const fetchImpl = fakeFetchOk({
      cnote: {
        cnote_no: 'JNE-001',
        detail: [
          { cnote: 'JNE-001', date: '20/07/2026 08:00', desc: 'Manifest', status: 'MANIFEST' },
          { cnote: 'JNE-001', date: '20/07/2026 06:00', desc: 'Acceptance', status: 'ACCEPTANCE' },
          { cnote: 'JNE-001', date: '20/07/2026 12:00', desc: 'Delivered', status: 'DELIVERED' },
        ],
        last_status: 'DELIVERED',
      },
    });
    const adapter = createJneAdapter({ apiKey, fetch: fetchImpl });
    const record = await adapter.trackShipment('JNE-001', 'tenant-c');
    expect(record).not.toBeNull();
    expect(record?.status).toBe('DELIVERED');
    expect(record?.events.map((e) => e.code)).toEqual(['LINKED', 'PICKED_UP', 'DELIVERED']);
    const times = record?.events.map((e) => e.at.getTime());
    expect(times).toStrictEqual([...(times ?? [])].sort((a, b) => a - b));
  });

  it('returns null on 404 trace', async () => {
    const fetchImpl = fakeFetchOk({ message: 'not found' }, 404);
    const adapter = createJneAdapter({ apiKey, fetch: fetchImpl });
    const result = await adapter.trackShipment('MISSING', 'tenant-c');
    expect(result).toBeNull();
  });

  it('appends webhook events to an existing cached record', async () => {
    const fetchImpl = fakeFetchOk({
      detail: [{ cnote_no: 'JNE-002', status: 'OK' }],
      status: 'success',
    });
    const adapter = createJneAdapter({ apiKey, fetch: fetchImpl });
    await adapter.createShipment({
      consigneeCity: 'c',
      consigneeName: 'n',
      consigneePhone: 'p',
      destinationZip: 'z',
      idempotencyKey: 'JNE-002',
      items: [{ qty: 1, weight: 1 }],
      service: 'REG',
      shipperName: 's',
      tenantId: 'tenant-d',
    });
    const result = adapter.handleWebhook({
      cnote_no: 'JNE-002',
      date: '20/07/2026 15:00',
      desc: 'Out for delivery',
      status: 'ON_DELIVERY',
      tenantId: 'tenant-d',
    });
    expect(result.verified).toBe(true);
    expect(result.record?.status).toBe('OUT_FOR_DELIVERY');
    expect(result.record?.events.length).toBeGreaterThanOrEqual(2);
    const cached = adapter.getShipment('tenant-d', 'JNE-002');
    expect(cached?.status).toBe('OUT_FOR_DELIVERY');
  });

  it('fails safe to UNKNOWN for an unrecognised JNE status code', async () => {
    const fetchImpl = fakeFetchOk({
      cnote: {
        cnote_no: 'JNE-003',
        detail: [{ cnote: 'JNE-003', date: '20/07/2026 09:00', desc: 'x', status: 'WEIRD_NEW_CODE' }],
        last_status: 'WEIRD_NEW_CODE',
      },
    });
    const adapter = createJneAdapter({ apiKey, fetch: fetchImpl });
    const record = await adapter.trackShipment('JNE-003', 'tenant-e');
    // Previously this mapped to IN_TRANSIT, which made a parcel of unknown
    // whereabouts look like it was moving normally (ADR-027, LOG-02).
    expect(record?.status).toBe('UNKNOWN');
  });
});
