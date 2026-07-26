import { describe, expect, it } from 'vitest';

import {
  base32Decode,
  base32Encode,
  generateTotpCode,
  generateTotpSecret,
  isTotpStepReplay,
  totpAuthUri,
  totpStepForTimestamp,
  verifyTotpCode,
} from './totp';

// RFC 4226 Appendix D shared secret ("12345678901234567890") and its base32.
const RFC_SECRET_ASCII = '12345678901234567890';
const RFC_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

// RFC 4226 Appendix D truncated 6-digit HOTP values, which equal TOTP(step).
const RFC_HOTP = [
  '755224',
  '287082',
  '359152',
  '969429',
  '338314',
  '254676',
  '287922',
  '162583',
  '399871',
  '520489',
];

describe('base32', () => {
  it('round-trips the RFC secret', () => {
    expect(base32Decode(RFC_SECRET_BASE32).toString('ascii')).toBe(RFC_SECRET_ASCII);
    expect(base32Encode(Buffer.from(RFC_SECRET_ASCII, 'ascii'))).toBe(RFC_SECRET_BASE32);
  });
});

describe('TOTP RFC 6238', () => {
  it('matches the RFC 4226 6-digit vectors for each step', () => {
    for (let step = 0; step < RFC_HOTP.length; step += 1) {
      expect(generateTotpCode(RFC_SECRET_BASE32, step)).toBe(RFC_HOTP[step]);
    }
  });

  it('accepts a valid code and reports the matched step (T=59s -> step 1)', () => {
    const result = verifyTotpCode(RFC_SECRET_BASE32, '287082', { timestamp: 59 });
    expect(result).toEqual({ valid: true, step: 1 });
  });

  it('accepts codes within the +/-1 step tolerance', () => {
    // At T=59s the current step is 1; step 0 and step 2 codes are still valid.
    expect(verifyTotpCode(RFC_SECRET_BASE32, RFC_HOTP[0] as string, { timestamp: 59 }).valid).toBe(
      true,
    );
    expect(verifyTotpCode(RFC_SECRET_BASE32, RFC_HOTP[2] as string, { timestamp: 59 }).valid).toBe(
      true,
    );
  });

  it('rejects a code outside the tolerance window', () => {
    // Step 5 code is 3 steps away from the current step (1) -> outside +/-1.
    const result = verifyTotpCode(RFC_SECRET_BASE32, RFC_HOTP[5] as string, { timestamp: 59 });
    expect(result).toEqual({ valid: false, step: null });
  });

  it('rejects malformed codes', () => {
    expect(verifyTotpCode(RFC_SECRET_BASE32, '12ab56', { timestamp: 59 }).valid).toBe(false);
    expect(verifyTotpCode(RFC_SECRET_BASE32, '1234567', { timestamp: 59 }).valid).toBe(false);
  });

  it('flags a replayed step and lets a strictly newer step through', () => {
    const first = verifyTotpCode(RFC_SECRET_BASE32, '287082', { timestamp: 59 });
    expect(first.step).toBe(1);
    // Same step re-presented after being consumed -> replay.
    expect(isTotpStepReplay(first.step as number, first.step as number)).toBe(true);
    // A later step is not a replay.
    expect(isTotpStepReplay(2, 1)).toBe(false);
  });

  it('generates decodable random secrets and a well-formed otpauth URI', () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret).length).toBe(20);
    const uri = totpAuthUri({ issuer: 'Chai', accountName: 'owner@example.test', secretBase32: secret });
    expect(uri.startsWith('otpauth://totp/Chai:owner%40example.test?')).toBe(true);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('computes the step from a timestamp', () => {
    expect(totpStepForTimestamp(0)).toBe(0);
    expect(totpStepForTimestamp(59)).toBe(1);
    expect(totpStepForTimestamp(60)).toBe(2);
  });
});
