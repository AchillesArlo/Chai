import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * scrypt password hashing via node:crypto (stdlib, no bcrypt/argon dependency).
 *
 * Stored format: `scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>`
 *
 * The cost parameters (N, r, p) and the per-user random salt are recorded in
 * the string itself, so a later parameter bump still verifies old rows with the
 * cost they were written with. Verification is constant-time (`timingSafeEqual`).
 */

export interface ScryptParams {
  /** CPU/memory cost, power of two. */
  N: number;
  /** Block size. */
  r: number;
  /** Parallelization. */
  p: number;
  /** Derived key length in bytes. */
  keyLength: number;
  /** Salt length in bytes. */
  saltLength: number;
}

export const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
  N: 16_384,
  r: 8,
  p: 1,
  keyLength: 64,
  saltLength: 16,
};

const SCRYPT_PREFIX = 'scrypt';

// scrypt needs maxmem >= 128 * N * r; the node default (32 MiB) is too small
// once N or r is raised, so size it from the params with headroom.
function maxmemFor(N: number, r: number): number {
  return Math.max(32 * 1024 * 1024, 256 * N * r);
}

function deriveKey(
  password: string,
  salt: Buffer,
  params: Pick<ScryptParams, 'N' | 'r' | 'p' | 'keyLength'>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      params.keyLength,
      { N: params.N, r: params.r, p: params.p, maxmem: maxmemFor(params.N, params.r) },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export function isScryptHash(stored: string): boolean {
  return stored.startsWith(`${SCRYPT_PREFIX}$`);
}

export async function hashPasswordScrypt(
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<string> {
  const salt = randomBytes(params.saltLength);
  const derived = await deriveKey(password, salt, params);
  return [
    SCRYPT_PREFIX,
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPasswordScrypt(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) {
    return false;
  }
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const N = Number.parseInt(nRaw, 10);
  const r = Number.parseInt(rRaw, 10);
  const p = Number.parseInt(pRaw, 10);
  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    N < 2 ||
    (N & (N - 1)) !== 0 ||
    r < 1 ||
    p < 1
  ) {
    return false;
  }

  let expected: Buffer;
  let salt: Buffer;
  try {
    expected = Buffer.from(hashB64, 'base64');
    salt = Buffer.from(saltB64, 'base64');
  } catch {
    return false;
  }
  if (expected.length === 0 || salt.length === 0) {
    return false;
  }

  const candidate = await deriveKey(password, salt, {
    N,
    r,
    p,
    keyLength: expected.length,
  });
  // Lengths are equal by construction (keyLength = expected.length), so
  // timingSafeEqual never throws and the comparison stays constant-time.
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
