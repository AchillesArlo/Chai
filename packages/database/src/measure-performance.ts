/**
 * K-05 performance measurement against the deployed stack.
 *
 * The gated suite in tests/performance authenticates with the `x-test-subject`
 * header, which the API only honours when APP_ENV is 'local' or 'test' (see
 * apps/api/src/auth/local-identity.ts) — so it cannot measure a staging or
 * production deployment. This measures the real path instead: log in over HTTP,
 * then drive authenticated requests through nginx with a real Bearer token.
 *
 * Usage: BASE=http://localhost node --import tsx/esm src/measure-performance.ts
 */
// Marks the file as a module so top-level await is allowed (TS1375); this is a
// standalone script with nothing worth exporting.
export {};

const BASE = process.env.BASE ?? 'http://127.0.0.1';
const EMAIL = process.env.PERF_EMAIL ?? 'owner@websitetest.chai.local';
const PASSWORD = process.env.PERF_PASSWORD ?? 'WebsiteTest#2026';

interface Sample {
  ms: number;
  status: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function summarise(label: string, samples: Sample[], wallMs: number): void {
  const ok = samples.filter((s) => s.status >= 200 && s.status < 400);
  const durations = ok.map((s) => s.ms).sort((a, b) => a - b);
  const statuses = [...new Set(samples.map((s) => s.status))].sort((a, b) => a - b);
  const throughput = wallMs > 0 ? (samples.length / wallMs) * 1000 : 0;

  console.log(`\n${label}`);
  console.log(`  requests      : ${samples.length}`);
  console.log(`  ok (2xx/3xx)  : ${ok.length}`);
  console.log(`  statuses seen : ${statuses.join(', ')}`);
  console.log(`  throughput    : ${throughput.toFixed(1)} req/s (wall ${wallMs.toFixed(0)}ms)`);
  if (durations.length > 0) {
    console.log(`  p50 / p95 / p99: ${percentile(durations, 50).toFixed(1)} / ${percentile(durations, 95).toFixed(1)} / ${percentile(durations, 99).toFixed(1)} ms`);
    console.log(`  min / max     : ${durations[0]?.toFixed(1)} / ${durations[durations.length - 1]?.toFixed(1)} ms`);
  }
}

async function timed(url: string, init?: RequestInit): Promise<Sample> {
  const start = performance.now();
  try {
    const res = await fetch(url, init);
    // Drain the body so the timing covers a full response, not just headers.
    await res.text();
    return { ms: performance.now() - start, status: res.status };
  } catch {
    return { ms: performance.now() - start, status: 0 };
  }
}

/** Fires `total` requests with at most `concurrency` in flight. */
async function drive(
  total: number,
  concurrency: number,
  make: () => Promise<Sample>,
): Promise<{ samples: Sample[]; wallMs: number }> {
  const samples: Sample[] = [];
  let issued = 0;
  const start = performance.now();
  const workers = Array.from({ length: concurrency }, async () => {
    while (issued < total) {
      issued += 1;
      samples.push(await make());
    }
  });
  await Promise.all(workers);
  return { samples, wallMs: performance.now() - start };
}

const loginRes = await fetch(`${BASE}/api/client/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error(`login failed: HTTP ${loginRes.status}`);
  process.exit(1);
}
const login = (await loginRes.json()) as { data?: { accessToken?: string } };
const token = login.data?.accessToken;
if (!token) {
  console.error('login response carried no accessToken');
  process.exit(1);
}
const authHeaders = { authorization: `Bearer ${token}` };

console.log(`Target: ${BASE}`);
console.log('Measured through nginx against the built production image.');

// Warm-up so JIT/connection setup does not skew the first samples.
await drive(20, 4, () => timed(`${BASE}/health`));

const health = await drive(300, 20, () => timed(`${BASE}/health`));
summarise('GET /health (unauthenticated, 20 concurrent)', health.samples, health.wallMs);

// Below the nginx edge limit (staging: api zone rate=30r/s, burst=50) so these
// numbers measure the API itself rather than the reverse proxy's throttle.
const convo = await drive(60, 6, () =>
  timed(`${BASE}/api/client/v1/conversations`, { headers: authHeaders }),
);
summarise(
  'GET /api/client/v1/conversations (Bearer, 6 concurrent, under edge limit)',
  convo.samples,
  convo.wallMs,
);

const leads = await drive(60, 6, () =>
  timed(`${BASE}/api/client/v1/leads`, { headers: authHeaders }),
);
summarise(
  'GET /api/client/v1/leads (Bearer, 6 concurrent, under edge limit)',
  leads.samples,
  leads.wallMs,
);

// Deliberately exceed the edge limit to confirm the throttle signals 429
// (client rate problem) rather than 503 (server fault).
const throttled = await drive(200, 40, () =>
  timed(`${BASE}/api/client/v1/conversations`, { headers: authHeaders }),
);
summarise(
  'GET /api/client/v1/conversations (40 concurrent, EXPECT 429 throttling)',
  throttled.samples,
  throttled.wallMs,
);
