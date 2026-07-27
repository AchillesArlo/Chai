import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  verifyAccessToken,
} from '@chai/auth';
import {
  generateTotpCode,
} from '@chai/auth/server';
import type { LoginResponse } from '@chai/contracts';

import { loadTokenConfig } from '../src/auth/token-config';
import { createApplication } from '../src/bootstrap';

/**
 * B1 end-to-end coverage for owner TOTP MFA on the in-memory store.
 *
 * TOTP correctness depends on wall-clock steps, so every test freezes *only*
 * Date (via `toFake: ['Date']`, leaving real timers/scrypt untouched) to a fixed
 * instant. That makes the step boundary deterministic: the code that confirms a
 * factor is one step older than the code that later verifies a login, which is
 * exactly what the single-use watermark requires.
 */

// D3: MFA secrets are now encrypted at rest; enrolment fails hard without a key.
// A fixed 64-hex (32-byte) key keeps this suite deterministic.
process.env.MFA_SECRET_KEY = 'a'.repeat(64);
// Lockout and rate-limiting are independent defenses; raise the strict auth cap
// so the lockout tests (which make many verify calls) exercise the lockout, not
// the per-route rate limiter.
process.env.AUTH_RATE_LIMIT_MAX = '1000';

const OWNER = { email: 'owner@chai.local', password: 'Password123!' };
const BASE_MS = Date.UTC(2026, 6, 27, 12, 0, 0);
const STEP = Math.floor(BASE_MS / 1000 / 30);

function parseBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

interface HttpResult {
  statusCode: number;
  json: unknown;
}

function dataOf<T>(result: HttpResult): T {
  return (result.json as { data: T }).data;
}

function errorCode(result: HttpResult): string {
  return String((result.json as { error?: { code?: unknown } }).error?.code);
}

let app: NestFastifyApplication;

async function login(body: unknown = OWNER): Promise<HttpResult> {
  const response = await app.inject({
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    payload: JSON.stringify(body),
    url: '/auth/login',
  });
  return { json: parseBody(response.body), statusCode: response.statusCode };
}

async function bearerPost(
  url: string,
  token: string,
  body?: unknown,
): Promise<HttpResult> {
  const base = { authorization: `Bearer ${token}` };
  const response = await app.inject({
    headers:
      body === undefined
        ? base
        : { ...base, 'content-type': 'application/json' },
    method: 'POST',
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    url,
  });
  return { json: parseBody(response.body), statusCode: response.statusCode };
}

async function bearerGet(url: string, token: string): Promise<HttpResult> {
  const response = await app.inject({
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
    url,
  });
  return { json: parseBody(response.body), statusCode: response.statusCode };
}

async function ownerAccessToken(): Promise<string> {
  return dataOf<LoginResponse>(await login()).accessToken;
}

/** Enroll a factor and confirm it with the current-step code. Returns the secret. */
async function enrollAndConfirm(token: string): Promise<string> {
  const enroll = await bearerPost('/auth/mfa/totp/enroll', token);
  expect(enroll.statusCode).toBe(200);
  const { secret } = dataOf<{ secret: string; otpauthUri: string }>(enroll);
  const confirm = await bearerPost('/auth/mfa/totp/confirm', token, {
    code: generateTotpCode(secret, STEP),
  });
  expect(confirm.statusCode).toBe(200);
  expect(dataOf<{ confirmed: boolean }>(confirm).confirmed).toBe(true);
  return secret;
}

beforeEach(async () => {
  app = await createApplication({ environment: 'test' });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE_MS);
});

afterEach(async () => {
  vi.useRealTimers();
  await app.close();
});

describe('B1 owner MFA (TOTP) enroll/confirm/verify', () => {
  it('completes enroll then confirm then verify and mints an ENROLLED session', async () => {
    const token = await ownerAccessToken();
    const secret = await enrollAndConfirm(token);

    // Verify with a strictly newer step than the one used to confirm.
    const verify = await bearerPost('/auth/mfa/totp/verify', token, {
      code: generateTotpCode(secret, STEP + 1),
    });
    expect(verify.statusCode).toBe(200);
    const session = dataOf<LoginResponse>(verify);
    const verified = await verifyAccessToken(session.accessToken, loadTokenConfig());
    expect(verified.ok).toBe(true);
    expect(verified.claims?.mfaState).toBe('ENROLLED');
  });

  it('rejects a confirmation code outside the time tolerance', async () => {
    const token = await ownerAccessToken();
    const enroll = await bearerPost('/auth/mfa/totp/enroll', token);
    const { secret } = dataOf<{ secret: string }>(enroll);

    // A code five steps away is well outside the +/-1 verification window.
    const confirm = await bearerPost('/auth/mfa/totp/confirm', token, {
      code: generateTotpCode(secret, STEP + 5),
    });
    expect(confirm.statusCode).toBe(401);
    expect(errorCode(confirm)).toBe('MFA_CODE_INVALID');
  });

  it('rejects a replayed verification code (same step twice)', async () => {
    const token = await ownerAccessToken();
    const secret = await enrollAndConfirm(token);
    const replayCode = generateTotpCode(secret, STEP + 1);

    const first = await bearerPost('/auth/mfa/totp/verify', token, {
      code: replayCode,
    });
    expect(first.statusCode).toBe(200);

    // The identical code (identical step) cannot be used a second time.
    const replay = await bearerPost('/auth/mfa/totp/verify', token, {
      code: replayCode,
    });
    expect(replay.statusCode).toBe(401);
    expect(errorCode(replay)).toBe('MFA_CODE_INVALID');
  });

  it('rejects a verification code outside the time tolerance', async () => {
    const token = await ownerAccessToken();
    const secret = await enrollAndConfirm(token);

    const outOfWindow = await bearerPost('/auth/mfa/totp/verify', token, {
      code: generateTotpCode(secret, STEP + 6),
    });
    expect(outOfWindow.statusCode).toBe(401);
    expect(errorCode(outOfWindow)).toBe('MFA_CODE_INVALID');
  });
});

describe('B1 mfaState is derived from the confirmed DB factor, not client input', () => {
  it('downgrades a fresh login to REQUIRED once a factor is confirmed and only server-side verify re-upgrades it', async () => {
    const firstToken = await ownerAccessToken();
    const secret = await enrollAndConfirm(firstToken);

    // Logging in again now yields a PARTIAL session: mfaState is REQUIRED because
    // a confirmed factor exists in the store, even though the seed principal is
    // ENROLLED. The value is derived from the store, never echoed from the seed.
    const partial = dataOf<LoginResponse>(await login());
    const partialClaims = (
      await verifyAccessToken(partial.accessToken, loadTokenConfig())
    ).claims;
    expect(partialClaims?.mfaState).toBe('REQUIRED');

    // The partial session is genuinely gated: an owner route rejects it.
    const gated = await bearerGet('/api/owner/v1/session', partial.accessToken);
    expect(gated.statusCode).toBe(401);
    expect(errorCode(gated)).toBe('MFA_REQUIRED');

    // Only the server-side TOTP verification, off the confirmed DB factor,
    // upgrades the session to ENROLLED.
    const verify = await bearerPost('/auth/mfa/totp/verify', partial.accessToken, {
      code: generateTotpCode(secret, STEP + 1),
    });
    expect(verify.statusCode).toBe(200);
    const upgraded = dataOf<LoginResponse>(verify);
    const upgradedClaims = (
      await verifyAccessToken(upgraded.accessToken, loadTokenConfig())
    ).claims;
    expect(upgradedClaims?.mfaState).toBe('ENROLLED');

    const allowed = await bearerGet('/api/owner/v1/session', upgraded.accessToken);
    expect(allowed.statusCode).toBe(200);
  });

  it('ignores a client-supplied mfaState and never upgrades a partial session via refresh', async () => {
    const firstToken = await ownerAccessToken();
    await enrollAndConfirm(firstToken);

    // A client trying to assert its own mfaState in the login body is rejected
    // outright by the whitelist validation — the claim cannot be forced in.
    const injected = await login({
      email: OWNER.email,
      password: OWNER.password,
      mfaState: 'ENROLLED',
    });
    expect(injected.statusCode).toBe(400);

    // A legitimate partial session cannot be silently promoted by rotating it.
    const partial = dataOf<LoginResponse>(await login());
    const partialClaims = (
      await verifyAccessToken(partial.accessToken, loadTokenConfig())
    ).claims;
    expect(partialClaims?.mfaState).toBe('REQUIRED');

    const refreshResponse = await app.inject({
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      payload: JSON.stringify({ refreshToken: partial.refreshToken }),
      url: '/auth/refresh',
    });
    expect(refreshResponse.statusCode).toBe(200);
    const rotated = (parseBody(refreshResponse.body) as { data: LoginResponse }).data;
    const rotatedClaims = (
      await verifyAccessToken(rotated.accessToken, loadTokenConfig())
    ).claims;
    expect(rotatedClaims?.mfaState).toBe('REQUIRED');
  });
});

describe('D3 MFA verification lockout (online brute-force guard)', () => {
  it('locks TOTP verification after 5 failed attempts and then rejects even a valid code', async () => {
    const token = await ownerAccessToken();
    const secret = await enrollAndConfirm(token);
    // A correctly-formatted code for a far step: passes DTO validation, but is
    // well outside the ±1 window so verification treats it as a wrong guess.
    const wrongCode = generateTotpCode(secret, STEP + 50);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const bad = await bearerPost('/auth/mfa/totp/verify', token, {
        code: wrongCode,
      });
      expect(bad.statusCode).toBe(401);
      expect(errorCode(bad)).toBe('MFA_CODE_INVALID');
    }

    // Now locked: a genuinely valid, fresh-step code is refused before the TOTP
    // check even runs. Without the lockout this would mint an ENROLLED session.
    const valid = await bearerPost('/auth/mfa/totp/verify', token, {
      code: generateTotpCode(secret, STEP + 1),
    });
    expect(valid.statusCode).toBe(401);
    expect(errorCode(valid)).toBe('MFA_CODE_INVALID');
  });

  it('does not lock below the threshold and a successful verify resets the counter', async () => {
    const token = await ownerAccessToken();
    const secret = await enrollAndConfirm(token);
    const wrongCode = generateTotpCode(secret, STEP + 50);

    // Round 1 (at BASE_MS): 4 failures (< 5) must NOT lock; a valid current-window
    // code then succeeds and resets the counter. Confirm consumed step STEP, so
    // STEP+1 is the fresh in-window step here.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const bad = await bearerPost('/auth/mfa/totp/verify', token, {
        code: wrongCode,
      });
      expect(bad.statusCode).toBe(401);
    }
    const firstOk = await bearerPost('/auth/mfa/totp/verify', token, {
      code: generateTotpCode(secret, STEP + 1),
    });
    expect(firstOk.statusCode).toBe(200);

    // Advance two TOTP steps so a fresh in-window code exists ABOVE the replay
    // watermark (now STEP+1) for the second success.
    const laterStep = STEP + 2;
    vi.setSystemTime(BASE_MS + 2 * 30 * 1000);

    // Round 2: 4 more failures. Had the first success NOT reset the counter, the
    // running total would reach 8 (≥ 5) and lock the factor, so the valid code
    // below would be refused. It succeeding proves the reset.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const bad = await bearerPost('/auth/mfa/totp/verify', token, {
        code: wrongCode,
      });
      expect(bad.statusCode).toBe(401);
    }
    const secondOk = await bearerPost('/auth/mfa/totp/verify', token, {
      code: generateTotpCode(secret, laterStep),
    });
    expect(secondOk.statusCode).toBe(200);
  });
});
