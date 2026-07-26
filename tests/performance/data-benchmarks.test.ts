import { describe, it, expect } from 'vitest';

/**
 * Performance: Database & Query Benchmarks
 *
 * Tests the performance of key data access patterns:
 *   - Lead listing at scale
 *   - Appointment booking under concurrent load
 *   - Team member operations
 *
 * These tests require a running API server. They are skipped by default
 * and only run when RUN_PERF_TESTS=true.
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

describePerf('data access benchmarks', () => {
  describe('lead operations', () => {
    it('lists leads efficiently', async () => {
      const iterations = 20;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const result = await timedRequest(`${API_BASE}/api/client/v1/leads`, {
          headers: CLIENT_HEADERS,
        });
        durations.push(result.duration);
      }

      console.log('Lead list performance:');
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Avg: ${(durations.reduce((a, b) => a + b, 0) / iterations).toFixed(1)}ms`);
      console.log(`  p95: ${percentile(durations, 95).toFixed(1)}ms`);

      expect(percentile(durations, 95)).toBeLessThan(500);
    });
  });

  describe('appointment booking under load', () => {
    it('handles concurrent booking requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => {
        const startsAt = new Date(Date.now() + 259200000 + i * 7200000).toISOString();
        const endsAt = new Date(Date.now() + 262800000 + i * 7200000).toISOString();
        return timedRequest(`${API_BASE}/api/client/v1/appointments`, {
          method: 'POST',
          headers: CLIENT_HEADERS,
          body: JSON.stringify({
            contactId: `contact-load-${i}`,
            idempotencyKey: `load-booking-${Date.now()}-${i}`,
            resourceId: `resource-load-${i}`,
            startsAt,
            endsAt,
            title: `Load test booking ${i}`,
          }),
        });
      });

      const results = await Promise.all(requests);
      const durations = results.map((r) => r.duration);
      const successes = results.filter((r) => r.status === 201);

      console.log('Concurrent booking results:');
      console.log(`  Successes: ${successes.length}/${results.length}`);
      console.log(`  p50: ${percentile(durations, 50).toFixed(1)}ms`);
      console.log(`  p95: ${percentile(durations, 95).toFixed(1)}ms`);

      expect(successes.length).toBe(results.length);
      expect(percentile(durations, 95)).toBeLessThan(2000);
    });
  });

  describe('team operations', () => {
    it('lists team members efficiently', async () => {
      const iterations = 20;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const result = await timedRequest(`${API_BASE}/api/client/v1/team`, {
          headers: CLIENT_HEADERS,
        });
        durations.push(result.duration);
      }

      console.log('Team list performance:');
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Avg: ${(durations.reduce((a, b) => a + b, 0) / iterations).toFixed(1)}ms`);
      console.log(`  p95: ${percentile(durations, 95).toFixed(1)}ms`);

      expect(percentile(durations, 95)).toBeLessThan(500);
    });
  });
});
