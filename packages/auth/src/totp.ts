import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP, self-contained on node:crypto (no otplib/speakeasy dependency).
 *
 * Defaults follow the widely-interoperable authenticator profile: HMAC-SHA1,
 * 6 digits, 30-second step, ±1 step verification tolerance for clock drift.
 * Replay is the caller's responsibility: `verifyTotpCode` returns the matched
 * step, and the caller must reject any step it has already accepted
 * (see {@link isTotpStepReplay}).
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_ALGORITHM = 'SHA1';
const TOTP_DEFAULT_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 encode, no padding, uppercase. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** RFC 4648 base32 decode. Ignores padding, spaces and case. */
export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/u, '').replace(/\s+/gu, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32 character in TOTP secret');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

/** New random base32 secret. 20 bytes = 160 bits, the RFC 4226 recommendation. */
export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

export function totpStepForTimestamp(
  unixSeconds: number,
  stepSeconds: number = TOTP_STEP_SECONDS,
): number {
  return Math.floor(unixSeconds / stepSeconds);
}

/** HOTP/TOTP code for a specific counter step. */
export function generateTotpCode(
  secretBase32: string,
  step: number,
  digits: number = TOTP_DIGITS,
): string {
  const key = base32Decode(secretBase32);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.max(0, Math.trunc(step))));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);
  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, '0');
}

export interface TotpVerifyOptions {
  /** Unix seconds to evaluate against. Defaults to now. */
  timestamp?: number;
  /** Steps of tolerance on each side. Defaults to ±1. */
  window?: number;
  digits?: number;
  stepSeconds?: number;
}

export interface TotpVerifyResult {
  valid: boolean;
  /** The counter step the code matched, for replay accounting. Null on failure. */
  step: number | null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    // Compare against self to keep the branch timing uniform, then fail.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Verifies a code within ±window steps and returns the matched step so the
 * caller can enforce single-use. Does NOT enforce replay itself.
 */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  options: TotpVerifyOptions = {},
): TotpVerifyResult {
  const digits = options.digits ?? TOTP_DIGITS;
  const stepSeconds = options.stepSeconds ?? TOTP_STEP_SECONDS;
  const window = options.window ?? TOTP_DEFAULT_WINDOW;
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const normalized = code.trim();
  if (!/^[0-9]+$/u.test(normalized) || normalized.length !== digits) {
    return { valid: false, step: null };
  }

  const current = totpStepForTimestamp(timestamp, stepSeconds);
  for (let offset = -window; offset <= window; offset += 1) {
    const step = current + offset;
    if (step < 0) {
      continue;
    }
    if (constantTimeEqual(generateTotpCode(secretBase32, step, digits), normalized)) {
      return { valid: true, step };
    }
  }
  return { valid: false, step: null };
}

/** A matched step is a replay if it is not strictly newer than the last used. */
export function isTotpStepReplay(step: number, lastUsedStep: number): boolean {
  return step <= lastUsedStep;
}

export interface OtpAuthUriInput {
  issuer: string;
  accountName: string;
  secretBase32: string;
  digits?: number;
  stepSeconds?: number;
}

/** otpauth:// URI consumed by authenticator apps (Google Authenticator, etc.). */
export function totpAuthUri({
  issuer,
  accountName,
  secretBase32,
  digits = TOTP_DIGITS,
  stepSeconds = TOTP_STEP_SECONDS,
}: OtpAuthUriInput): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: TOTP_ALGORITHM,
    digits: String(digits),
    period: String(stepSeconds),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
