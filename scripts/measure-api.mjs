// K-05: measures the API directly (bypassing the nginx edge rate limit) so the
// numbers describe the application, not the proxy's throttle. Run inside the
// api container: node /tmp/measure-api.mjs
const BASE = process.env.BASE ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.PERF_EMAIL ?? 'owner@websitetest.chai.local';
const PASSWORD = process.env.PERF_PASSWORD ?? 'WebsiteTest#2026';

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)] ?? 0;
}

function summarise(label, samples, wallMs) {
  const ok = samples.filter((s) => s.status >= 200 && s.status < 400);
  const d = ok.map((s) => s.ms).sort((a, b) => a - b);
  const statuses = [...new Set(samples.map((s) => s.status))].sort((a, b) => a - b);
  console.log(`\n${label}`);
  console.log(`  requests / ok : ${samples.length} / ${ok.length}`);
  console.log(`  statuses      : ${statuses.join(', ')}`);
  console.log(`  throughput    : ${((samples.length / wallMs) * 1000).toFixed(1)} req/s`);
  if (d.length) {
    console.log(
      `  p50/p95/p99   : ${percentile(d, 50).toFixed(1)} / ${percentile(d, 95).toFixed(1)} / ${percentile(d, 99).toFixed(1)} ms`,
    );
  }
}

async function timed(url, init) {
  const start = performance.now();
  try {
    const res = await fetch(url, init);
    await res.text();
    return { ms: performance.now() - start, status: res.status };
  } catch {
    return { ms: performance.now() - start, status: 0 };
  }
}

async function drive(total, concurrency, make) {
  const samples = [];
  let issued = 0;
  const start = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (issued < total) {
        issued += 1;
        samples.push(await make());
      }
    }),
  );
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
const token = (await loginRes.json()).data?.accessToken;
const headers = { authorization: `Bearer ${token}` };

console.log(`Target: ${BASE} (direct to API, no nginx edge limit)`);
await drive(20, 4, () => timed(`${BASE}/api/v1/health`));

const health = await drive(500, 25, () => timed(`${BASE}/api/v1/health`));
summarise('GET /api/v1/health (25 concurrent)', health.samples, health.wallMs);

const convo = await drive(500, 25, () =>
  timed(`${BASE}/api/client/v1/conversations`, { headers }),
);
summarise('GET /api/client/v1/conversations (Bearer, 25 concurrent)', convo.samples, convo.wallMs);

const leads = await drive(500, 25, () => timed(`${BASE}/api/client/v1/leads`, { headers }));
summarise('GET /api/client/v1/leads (Bearer, 25 concurrent)', leads.samples, leads.wallMs);
