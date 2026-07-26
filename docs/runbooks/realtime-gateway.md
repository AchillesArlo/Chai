# Runbook — Realtime Gateway (SSE)

**Severity:** high — live client connectivity
**Owner:** realtime on-call

## Overview

Fastify app exposing SSE per tenant. Port `REALTIME_PORT` (default `3010`);
compose target `realtime-gateway:3010`. Two endpoints:

- `GET /stream/:tenantId` — opens an SSE connection, replays up to
  `REPLAY_LIMIT=100` events after the client's `Last-Event-ID` cursor, then
  streams live. If the cursor predates the bounded retention window, the
  gateway sends a `refetch-required` event and closes.
- `POST /ingest` — `{ tenantId, event: { id, event, data } }`. Validates,
  appends to the tenant's in-memory stream, returns `201 { accepted: 1 }`.

`EventStore` holds one `BoundedStream` per tenant, capped at `BOUND=500`
events (FIFO eviction). No persistence — restart loses the buffer; clients
refetch on reconnect. `# ponytail:` durable event store is a later stage.

## Failure modes

- **Gateway down** — process not listening on 3010; clients can't connect,
  API publish gets 5xx/ECONNREFUSED.
- **EventStore memory growth** — unbounded tenant count or a runaway producer
  spamming one tenant. The per-tenant cap is 500 events; total memory is
  ~tenant_count × 500 events. Symptom: RSS climbs, OOM-kill risk.
- **Client can't connect** — 404/wrong tenant, network/firewall, or the
  `X-Accel-Buffering` header stripped by a proxy breaking the stream.
- **Cursor replay failures** — client sends a `Last-Event-ID` older than the
  500-event window; gateway sends `refetch-required` and the client must
  re-fetch full state from the API. High rates of this = retention too small
  or clients reconnecting too slowly.
- **Ingest errors** — malformed body, missing `event.id`, or wrong tenant;
  gateway returns 400, nothing appended.

## Triage commands

Process / port:

```bash
# gateway listening?
curl -sS -o /dev/null -w "%{http_code}\n" http://realtime-gateway:3010/healthz
# or hit /stream/:tenantId and expect a 200 + SSE headers
curl -sS -N -m 2 http://realtime-gateway:3010/stream/<tenant-uuid>
```

Connected SSE clients — `# ponytail:` no `/metrics`-exposed gauge yet; until
landed, count from logs or process fd usage as a proxy:

```bash
# rough connection count (one ESTABLISHED fd per SSE client)
ss -tn 'dport = :3010' | grep -c ESTAB
# or from the gateway pod
ls /proc/$(pidof realtime-gateway)/fd | wc -l
```

EventStore stream sizes — no SQL here (in-memory). Inspect via a debug
endpoint or logs; the cap is 500 per tenant, so any tenant showing > 500 is
impossible by construction (eviction), but tenant count growth is the real
signal:

```bash
# rough tenant count = distinct stream keys; check logs for stream creation
# or count distinct tenantIds in recent ingest traffic
```

Ingest error rate — from gateway logs (4xx on `/ingest`) or the
`chai_realtime_ingest_errors_total` counter once instrumented.

## Recovery

### Gateway down

Restart the pod/container. On compose: `docker compose restart
realtime-gateway`. Accept the buffer loss — clients reconnect, send
`Last-Event-ID`, and most will get a `refetch-required` then re-fetch from
the API. No data corruption (buffer is a cache, source of truth is upstream).

### Memory growth (too many tenants or runaway producer)

- Short term: restart the gateway (clears all buffers). Clients refetch.
- If one tenant is producing > ~1 event/sec sustained, throttle the producer
  (API publish rate) or raise `BOUND` deliberately — `# ponytail:` a real
  backpressure/eviction metric lands with the durable store.

### Client can't connect

1. Confirm gateway up (curl above).
2. Confirm the `tenantId` is valid for the client's session.
3. Check any reverse proxy preserves `X-Accel-Buffering: no` and doesn't
   buffer the response (nginx: `proxy_buffering off;`).

### Cursor replay failures (high `refetch-required` rate)

Retention is 500 events. If clients routinely hit it, either they reconnect
too rarely or the producer burst exceeds the window. Either raise `BOUND` or
have clients reconnect sooner. Real fix is the durable store.

## SLO

- Ingest availability: `POST /ingest` 2xx rate > 99.5%.
- Replay coverage: `refetch-required` rate < 1% of connects.
- Connect latency: time-to-first-byte on `/stream/:tenantId` < 200ms p95.
`# ponytail:` real SLO numbers pending the load test; until then these are
targets, not measured commitments.

## Abort / escalate

- A restart clears all client buffers — only do it if memory is critical or
  the process is wedged. Otherwise prefer throttle + wait.
- If ingest errors spike (alert `RealtimeIngestErrorRateHigh`), suspect a
  bad producer in the API; page the S2-5 owner, don't just restart the gateway.

## Evidence

Record: incident time, gateway pod/version, connected-client count before
restart, tenant count, any `refetch-required` spike, ingest 4xx count, root
cause, whether the durable-store work was in flight.
