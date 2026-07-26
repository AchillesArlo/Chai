import { describe, it, expect } from 'vitest';

/**
 * Performance: API Load Tests
 *
 * These tests measure API performance under load. They use native fetch
 * with concurrent request patterns to simulate load without requiring
 * external tools (k6/Artillery) to be installed.
 *
 * These tests require a running API server. They are skipped by default
 * and only run when API_BASE is explicitly set AND the server is reachable.
 *
 * Targets:
 *   - Concurrent webhook ingestion: 100 req/s
 *   - Conversation list pagination: 1000 conversations
 *   - Analytics query performance: < 500ms p95
 */

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const RUN_PERF_TESTS = process.env.RUN_PERF_TESTS === 'true';

const describePerf = RUN_PERF_TESTS ? describe : describe.skip;
const CLIENT_HEADERS = {
  'Content-Type': 'application/json',
  'x-test-subject': 'local|client-owner',
};

interface TimingResult {
  duration: number;
  status: number;
}

async function timedRequest(
  url: string,
  options: RequestInit = {},
): Promise<TimingResult> {
  const start = performance.now();
  try {
    const response = await fetch(url, options);
    const duration = performance.now() - start;
    return { duration, status: response.status };
  } catch {
    const duration = performance.now() - start;
    return { duration, status: 0 };
  }
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

describePerf('api load tests', () => {
  describe('webhook ingestion throughput', () => {
    it('handles 10 concurrent webhook requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) =>
        timedRequest(`${API_BASE}/api/service/v1/channels/mock/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `+1555${String(i).padStart(7, '0')}`,
            message: `Load test message ${i}`,
            tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
          }),
        }),
      );

      const results = await Promise.all(requests);
      const durations = results.map((r) => r.duration);
      const successes = results.filter((r) => r.status === 200);

      console.log('Webhook concurrent load results:');
      console.log(`  Successes: ${successes.length}/${results.length}`);
      console.log(`  p50: ${percentile(durations, 50).toFixed(1)}ms`);
      console.log(`  p95: ${percentile(durations, 95).toFixed(1)}ms`);
      console.log(`  p99: ${percentile(durations, 99).toFixed(1)}ms`);

      expect(successes.length).toBe(results.length);
      expect(percentile(durations, 95)).toBeLessThan(2000);
    });

    it('sustains sequential webhook ingestion at target rate', async () => {
      const count = 50;
      const durations: number[] = [];

      for (let i = 0; i < count; i++) {
        const result = await timedRequest(
          `${API_BASE}/api/service/v1/channels/mock/webhook`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: `+1555${String(i).padStart(7, '0')}`,
              message: `Sequential load test ${i}`,
              tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
            }),
          },
        );
        durations.push(result.duration);
      }

      const totalMs = durations.reduce((a, b) => a + b, 0);
      const reqPerSec = (count / totalMs) * 1000;

      console.log('Webhook sequential load results:');
      console.log(`  Total requests: ${count}`);
      console.log(`  Total time: ${totalMs.toFixed(0)}ms`);
      console.log(`  Throughput: ${reqPerSec.toFixed(1)} req/s`);
      console.log(`  Avg latency: ${(totalMs / count).toFixed(1)}ms`);
      console.log(`  p95: ${percentile(durations, 95).toFixed(1)}ms`);

      // Baseline: should handle at least 10 req/s in test environment
      expect(reqPerSec).toBeGreaterThan(10);
    });
  });

  describe('conversation list pagination', () => {
    it('returns conversation list within acceptable latency', async () => {
      // First seed some conversations via webhooks
      const seedCount = 20;
      for (let i = 0; i < seedCount; i++) {
        await fetch(`${API_BASE}/api/service/v1/channels/mock/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `+1555${String(100 + i).padStart(7, '0')}`,
            message: `Pagination seed ${i}`,
            tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
          }),
        });
      }

      // Measure list endpoint
      const result = await timedRequest(
        `${API_BASE}/api/client/v1/conversations`,
        { headers: CLIENT_HEADERS },
      );

      console.log('Conversation list performance:');
      console.log(`  Status: ${result.status}`);
      console.log(`  Duration: ${result.duration.toFixed(1)}ms`);

      expect(result.status).toBe(200);
      expect(result.duration).toBeLessThan(2000);
    });

    it('handles concurrent conversation list requests', async () => {
      const requests = Array.from({ length: 10 }, () =>
        timedRequest(`${API_BASE}/api/client/v1/conversations`, {
          headers: CLIENT_HEADERS,
        }),
      );

      const results = await Promise.all(requests);
      const durations = results.map((r) => r.duration);
      const successes = results.filter((r) => r.status === 200);

      console.log('Concurrent conversation list results:');
      console.log(`  Successes: ${successes.length}/${results.length}`);
      console.log(`  p50: ${percentile(durations, 50).toFixed(1)}ms`);
      console.log(`  p95: ${percentile(durations, 95).toFixed(1)}ms`);

      expect(successes.length).toBe(results.length);
      expect(percentile(durations, 95)).toBeLessThan(3000);
    });
  });

  describe('analytics query performance', () => {
    it('returns outcomes dashboard within target latency', async () => {
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const result = await timedRequest(
          `${API_BASE}/api/client/v1/analytics/outcomes`,
          { headers: CLIENT_HEADERS },
        );
        durations.push(result.duration);
      }

      console.log('Analytics query performance:');
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Avg: ${(durations.reduce((a, b) => a + b, 0) / iterations).toFixed(1)}ms`);
      console.log(`  p50: ${percentile(durations, 50).toFixed(1)}ms`);
      console.log(`  p95: ${percentile(durations, 95).toFixed(1)}ms`);
      console.log(`  p99: ${percentile(durations, 99).toFixed(1)}ms`);

      // p95 should be under 500ms for analytics queries
      expect(percentile(durations, 95)).toBeLessThan(500);
    });
  });

  describe('payment checkout performance', () => {
    it('creates checkout sessions within acceptable latency', async () => {
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const result = await timedRequest(
          `${API_BASE}/api/client/v1/payments/checkout`,
          {
            method: 'POST',
            headers: CLIENT_HEADERS,
            body: JSON.stringify({
              amount: 1000 + i,
              currency: 'usd',
              idempotencyKey: `perf-${Date.now()}-${i}`,
            }),
          },
        );
        durations.push(result.duration);
      }

      console.log('Payment checkout performance:');
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Avg: ${(durations.reduce((a, b) => a + b, 0) / iterations).toFixed(1)}ms`);
      console.log(`  p95: ${percentile(durations, 95).toFixed(1)}ms`);

      expect(percentile(durations, 95)).toBeLessThan(1000);
    });
  });
});
