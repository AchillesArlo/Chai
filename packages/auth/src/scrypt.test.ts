import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCRYPT_PARAMS,
  hashPasswordScrypt,
  isScryptHash,
  verifyPasswordScrypt,
} from './scrypt';

describe('scrypt password hashing', () => {
  it('produces a self-describing scrypt hash and verifies the correct password', async () => {
    const hash = await hashPasswordScrypt('Correct-Horse-Battery-Staple-1');
    expect(isScryptHash(hash)).toBe(true);
    const parts = hash.split('$');
    expect(parts[0]).toBe('scrypt');
    expect(Number.parseInt(parts[1] as string, 10)).toBe(DEFAULT_SCRYPT_PARAMS.N);
    expect(Number.parseInt(parts[2] as string, 10)).toBe(DEFAULT_SCRYPT_PARAMS.r);
    expect(Number.parseInt(parts[3] as string, 10)).toBe(DEFAULT_SCRYPT_PARAMS.p);
    expect(await verifyPasswordScrypt('Correct-Horse-Battery-Staple-1', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPasswordScrypt('the-right-password');
    expect(await verifyPasswordScrypt('the-wrong-password', hash)).toBe(false);
  });

  it('uses a fresh salt per hash so identical passwords differ', async () => {
    const a = await hashPasswordScrypt('same-password');
    const b = await hashPasswordScrypt('same-password');
    expect(a).not.toBe(b);
    expect(await verifyPasswordScrypt('same-password', a)).toBe(true);
    expect(await verifyPasswordScrypt('same-password', b)).toBe(true);
  });

  it('rejects a tampered or malformed stored hash', async () => {
    const hash = await hashPasswordScrypt('pw');
    const tampered = `${hash.slice(0, -2)}AA`;
    expect(await verifyPasswordScrypt('pw', tampered)).toBe(false);
    expect(await verifyPasswordScrypt('pw', 'not-a-hash')).toBe(false);
    expect(await verifyPasswordScrypt('pw', 'scrypt$0$8$1$x$y')).toBe(false);
  });
});
