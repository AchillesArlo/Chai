/**
 * Stage 1 pilot load/burst drill (synthetic, no production traffic).
 *
 * Measures sequential webhook accept latency against a running API.
 * Usage:
 *   node scripts/pilot/load-drill.mjs [baseUrl] [count]
 * Default: http://127.0.0.1:3001  50
 */
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3001';
const count = Number.parseInt(process.argv[3] ?? '50', 10);

const latencies = [];
let accepted = 0;
let failed = 0;

for (let i = 0; i < count; i += 1) {
  const started = performance.now();
  try {
    const response = await fetch(
      `${baseUrl}/api/service/v1/channels/mock-channel/webhook`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          external_event_id: `load-${Date.now()}-${i}`,
          external_message_id: `load-msg-${i}`,
          external_user_id: `load-user-${i % 10}`,
          text: `load drill ${i}`,
        }),
      },
    );
    const ms = performance.now() - started;
    latencies.push(ms);
    if (response.ok) accepted += 1;
    else failed += 1;
  } catch {
    latencies.push(performance.now() - started);
    failed += 1;
  }
}

latencies.sort((a, b) => a - b);
const p = (q) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] ?? 0;

const report = {
  accepted,
  count,
  failed,
  p50Ms: Number(p(0.5).toFixed(2)),
  p95Ms: Number(p(0.95).toFixed(2)),
  p99Ms: Number(p(0.99).toFixed(2)),
  target: baseUrl,
  timestamp: new Date().toISOString(),
};

console.log(JSON.stringify(report, null, 2));
if (failed > count * 0.1) process.exitCode = 1;
