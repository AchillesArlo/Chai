import { randomUUID } from 'node:crypto';

import { createMockShippingAdapter } from '../mock-shipping/index.js';

export type { ShipmentMilestone, TrackingEvent } from '../mock-shipping/index.js';

import type { ShipmentMilestone, ShipmentRecord, TrackingEvent } from '../mock-shipping/index.js';

export interface JneBookingRequest {
  carrier?: string;
  consigneeCity: string;
  consigneeName: string;
  consigneePhone: string;
  destinationZip: string;
  idempotencyKey: string;
  items: Array<{ declaredValue?: number; qty: number; weight: number }>;
  origin?: string;
  service: string;
  shipperName: string;
  tenantId: string;
}

export interface JneShipmentRecord extends ShipmentRecord {
  carrier: 'jne';
  provider: 'jne';
  providerBookingRef?: string;
  service?: string;
}

export interface JneTrackingWebhookResult {
  record: JneShipmentRecord | null;
  verified: boolean;
}

export interface JneAdapterOptions {
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  origin?: string;
  traceBaseUrl?: string;
  username?: string;
}

const DEFAULT_TRACE_BASE = 'https://apiv2.jne.co.id:10101/tracing/api/v1/trace';

type FetchLike = typeof globalThis.fetch;

/**
 * Provider-code → canonical-status map, versioned.
 *
 * The version travels with every mapped event so an operator can tell which
 * revision produced a projection, and so a mapping fix is auditable rather than
 * silent (ADR-027, LOG-02).
 */
export const JNE_STATUS_MAP_VERSION = 1;

const MILESTONE_MAP: Record<string, ShipmentMilestone> = {
  ACCEPTANCE: 'LINKED',
  MANIFEST: 'PICKED_UP',
  PICKED_UP: 'PICKED_UP',
  RECEIVED: 'PICKED_UP',
  DEPARTED: 'IN_TRANSIT',
  TRANSIT: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  ARRIVED: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  POD: 'DELIVERED',
  ON_DELIVERY: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  REJECTED: 'EXCEPTION',
  RETURN: 'EXCEPTION',
  CANCEL: 'EXCEPTION',
  EXCEPTION: 'EXCEPTION',
};

export interface MappedMilestone {
  code: ShipmentMilestone;
  mappingVersion: number;
  /** Original provider code, retained as diagnostic metadata. */
  providerCode: string | null;
  /** True when the provider code is not in the map, so the caller can alert. */
  unmapped: boolean;
}

/**
 * Maps a provider status code to a canonical milestone, failing SAFE.
 *
 * An absent or unrecognised code becomes UNKNOWN, not IN_TRANSIT. Guessing
 * "probably moving" is how a lost parcel keeps looking healthy to the customer.
 */
export function mapJneMilestone(code: string | undefined): MappedMilestone {
  if (!code) {
    return {
      code: 'UNKNOWN',
      mappingVersion: JNE_STATUS_MAP_VERSION,
      providerCode: null,
      unmapped: true,
    };
  }
  const upper = code.toUpperCase().replace(/\s+/g, '_');
  const mapped = MILESTONE_MAP[upper];
  return {
    code: mapped ?? 'UNKNOWN',
    mappingVersion: JNE_STATUS_MAP_VERSION,
    providerCode: code,
    unmapped: mapped === undefined,
  };
}

function mapMilestone(code: string | undefined): ShipmentMilestone {
  return mapJneMilestone(code).code;
}

interface JneTraceEvent {
  actual?: string;
  city?: string;
  cnote: string;
  date?: string;
  desc?: string;
  status?: string;
}

interface JneTraceResponse {
  cnote: {
    cnote_no?: string;
    detail?: Array<JneTraceEvent>;
    last_status?: string;
    last_status_date?: string;
    last_status_desc?: string;
  };
  history?: Array<JneTraceEvent>;
  message?: string;
  status?: string;
}

interface JneCreateResponse {
  detail?: Array<{ cnote_no?: string; status?: string }>;
  message?: string;
  status?: string;
  tracking_number?: string;
}

function parseJneDate(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toTrackingEvent(ev: JneTraceEvent, idx: number): TrackingEvent | null {
  const code = ev.status ?? ev.desc;
  if (!code && !ev.cnote) return null;
  return {
    at: parseJneDate(ev.date ?? ev.actual),
    code: mapMilestone(code),
    description: ev.desc ?? ev.city ?? code ?? '',
    eventId: `jne-${idx}-${ev.cnote ?? 'evt'}`,
  };
}

function emptyShipmentRecord(
  tenantId: string,
  trackingNumber: string,
): JneShipmentRecord {
  const now = new Date();
  return {
    carrier: 'jne',
    events: [],
    lastSyncedAt: now,
    provider: 'jne',
    status: 'LINKED',
    tenantId,
    trackingNumber,
  };
}

/**
 * JNE logistics sandbox adapter. Without `apiKey` the adapter falls back to
 * the mock-shipping in-memory timeline so local dev and CI work without
 * credentials. With a key, booking and trace calls hit the JNE API and
 * tracking webhooks are normalized into the canonical milestone timeline.
 */
export function createJneAdapter(options: JneAdapterOptions = {}) {
  const {
    apiKey,
    origin = 'CGK10000',
    fetch: fetchImpl = globalThis.fetch as FetchLike,
    traceBaseUrl = DEFAULT_TRACE_BASE,
    username,
  } = options;

  const fallback = createMockShippingAdapter();
  const live = Boolean(apiKey);
  const liveShipments = new Map<string, JneShipmentRecord>();

  function key(tenantId: string, trackingNumber: string): string {
    return `${tenantId}:${trackingNumber}`;
  }

  function clone(record: JneShipmentRecord): JneShipmentRecord {
    return {
      ...record,
      events: record.events.map((event) => ({ ...event, at: new Date(event.at) })),
      lastSyncedAt: new Date(record.lastSyncedAt),
    };
  }

  return {
    isLive(): boolean {
      return live;
    },

    getOrigin(): string {
      return origin;
    },

    async createShipment(booking: JneBookingRequest): Promise<JneShipmentRecord> {
      if (!live) {
        const record = fallback.linkShipment({
          carrier: booking.carrier ?? 'jne',
          tenantId: booking.tenantId,
          trackingNumber: booking.idempotencyKey,
        });
        return { ...record, carrier: 'jne', provider: 'jne' };
      }

      const totalWeight = booking.items.reduce((sum, item) => sum + item.weight * item.qty, 0);
      const body = {
        OLSHOP_BRANCH: booking.origin ?? origin,
        OLSHIP_CARGO: 'NO',
        OLSHIP_CID: '0',
        OLSHIP_CNOTE: booking.idempotencyKey,
        OLSHIP_CITY: booking.consigneeCity,
        OLSHIP_CPHONE: booking.consigneePhone,
        OLSHIP_CZIP: booking.destinationZip,
        OLSHIP_QTY: String(booking.items.reduce((sum, item) => sum + item.qty, 0)),
        OLSHIP_SERVICE: booking.service,
        OLSHIP_SHIPPER: booking.shipperName,
        OLSHIP_WEIGHT: String(totalWeight),
        USERNAME: username ?? '',
        API_KEY: apiKey,
        id: booking.idempotencyKey,
      };

      const response = await fetchImpl(traceBaseUrl.replace('/trace', '/create'), {
        body: JSON.stringify(body),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': booking.idempotencyKey,
        },
        method: 'POST',
      });

      const json = (await response.json()) as JneCreateResponse;
      if (!response.ok) {
        throw new Error(`JNE_CREATE_FAILED: ${response.status} ${json.message ?? ''}`);
      }

      const trackingNumber =
        json.tracking_number ??
        json.detail?.[0]?.cnote_no ??
        booking.idempotencyKey;

      const record = emptyShipmentRecord(booking.tenantId, trackingNumber);
      record.service = booking.service;
      record.events.push({
        at: new Date(),
        code: 'LINKED',
        description: `Shipment booked with JNE service ${booking.service}`,
        eventId: `jne-link-${randomUUID().slice(0, 8)}`,
      });
      record.providerBookingRef = json.detail?.[0]?.status;
      liveShipments.set(key(booking.tenantId, trackingNumber), record);
      return clone(record);
    },

    async trackShipment(
      trackingNumber: string,
      tenantId = '*',
    ): Promise<JneShipmentRecord | null> {
      if (!live) {
        const record = fallback.getShipment(tenantId, trackingNumber);
        if (!record) return null;
        return { ...record, carrier: 'jne', provider: 'jne' };
      }

      const body = { API_KEY: apiKey, USERNAME: username ?? '', awb: trackingNumber };
      const response = await fetchImpl(traceBaseUrl, {
        body: JSON.stringify(body),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`JNE_TRACK_FAILED: ${response.status}`);
      }

      const json = (await response.json()) as JneTraceResponse;
      const rawEvents = json.cnote?.detail ?? json.history ?? [];
      const events: TrackingEvent[] = rawEvents
        .map((ev, idx) => toTrackingEvent(ev, idx))
        .filter((ev): ev is TrackingEvent => ev !== null)
        .sort((a, b) => a.at.getTime() - b.at.getTime());

      const cached = liveShipments.get(key(tenantId, trackingNumber));
      const base = cached ?? emptyShipmentRecord(tenantId, trackingNumber);
      const record: JneShipmentRecord = {
        ...base,
        events,
        lastSyncedAt: new Date(),
        status: events.length > 0 ? mapMilestone(json.cnote?.last_status) : base.status,
      };
      liveShipments.set(key(tenantId, trackingNumber), record);
      return clone(record);
    },

    handleWebhook(payload: unknown): JneTrackingWebhookResult {
      if (!payload || typeof payload !== 'object') {
        return { record: null, verified: false };
      }
      const body = payload as {
        awb?: string;
        cnote?: string;
        cnote_no?: string;
        date?: string;
        desc?: string;
        status?: string;
        tenantId?: string;
        tracking_number?: string;
      };

      const trackingNumber = body.cnote_no ?? body.cnote ?? body.awb ?? body.tracking_number;
      const tenantId = body.tenantId ?? '*';
      if (!trackingNumber || !body.status) {
        return { record: null, verified: false };
      }

      const cached = liveShipments.get(key(tenantId, trackingNumber));
      const base = cached ?? emptyShipmentRecord(tenantId, trackingNumber);
      const milestone = mapMilestone(body.status);
      const event: TrackingEvent = {
        at: parseJneDate(body.date),
        code: milestone,
        description: body.desc ?? body.status,
        eventId: `jne-wh-${randomUUID().slice(0, 8)}`,
      };
      const events = [...base.events, event].sort((a, b) => a.at.getTime() - b.at.getTime());
      const record: JneShipmentRecord = {
        ...base,
        events,
        lastSyncedAt: new Date(),
        status: milestone,
      };
      liveShipments.set(key(tenantId, trackingNumber), record);
      return { record: clone(record), verified: true };
    },

    getShipment(tenantId: string, trackingNumber: string): JneShipmentRecord | null {
      if (!live) {
        const record = fallback.getShipment(tenantId, trackingNumber);
        return record ? { ...record, carrier: 'jne', provider: 'jne' } : null;
      }
      const record = liveShipments.get(key(tenantId, trackingNumber));
      return record ? clone(record) : null;
    },

    setKillSwitch(enabled: boolean): void {
      fallback.setKillSwitch(enabled);
    },

    isKillSwitchOn(): boolean {
      return fallback.isKillSwitchOn();
    },
  };
}

export type JneAdapter = ReturnType<typeof createJneAdapter>;
