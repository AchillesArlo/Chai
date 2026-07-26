import { describe, expect, it } from 'vitest';

import {
  type Audience,
  type Principal,
  decodeTokenUnsafe,
  extractBearerToken,
  hashPassword,
  verifyAccessToken,
  verifyPassword,
  verifyRefreshToken,
  issueTokens,
  type TokenConfig,
} from './index';

const NOW = 1_700_000_000;

const OWNER_PRINCIPAL: Principal = {
  audience: 'owner-console',
  authenticatedAt: new Date(NOW * 1000),
  id: '01890f47-9b3c-7cc2-98e8-1234567892ff',
  kind: 'USER',
  status: 'ACTIVE',
};

const CLIENT_PRINCIPAL: Principal = {
  audience: 'client-portal',
  authenticatedAt: new Date(NOW * 1000),
  id: '01890f47-9b3c-7cc2-98e8-123456789205',
  kind: 'USER',
  membership: {
    role: 'CLIENT_OWNER',
    status: 'ACTIVE',
    tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
  },
  status: 'ACTIVE',
};

const CONFIG: TokenConfig = {
  secret: 'test-access-secret-very-long-and-random',
  issuer: 'chai-test',
};

function principalFor(audience: Audience): Principal {
  return audience === 'owner-console' ? OWNER_PRINCIPAL : CLIENT_PRINCIPAL;
}

describe('tokens', () => {
  it('issues verifiable access + refresh tokens with correct claims', async () => {
    const issued = await issueTokens({
      principal: CLIENT_PRINCIPAL,
      config: CONFIG,
      now: NOW,
    });

    expect(issued.accessToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(issued.refreshToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(issued.expiresIn).toBeGreaterThan(0);
    expect(issued.accessTokenExpiresAt).toBe(NOW + issued.expiresIn);
    expect(issued.refreshTokenExpiresAt).toBeGreaterThan(issued.accessTokenExpiresAt);

    const verified = await verifyAccessToken(issued.accessToken, CONFIG, NOW);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims?.sub).toBe(CLIENT_PRINCIPAL.id);
      expect(verified.claims?.aud).toBe('client-portal');
      expect(verified.claims?.iss).toBe(CONFIG.issuer);
      expect(verified.claims?.tenantId).toBe(
        CLIENT_PRINCIPAL.kind === 'USER'
          ? CLIENT_PRINCIPAL.membership?.tenantId
          : undefined,
      );
      expect(verified.claims?.role).toBe('CLIENT_OWNER');
    }
  });

  it('owner access token has the shorter owner lifetime', async () => {
    const issued = await issueTokens({
      principal: OWNER_PRINCIPAL,
      config: CONFIG,
      now: NOW,
    });
    expect(issued.expiresIn).toBe(600);
  });

  it('refresh token is rejected when verified as access', async () => {
    const issued = await issueTokens({
      principal: CLIENT_PRINCIPAL,
      config: CONFIG,
      now: NOW,
    });
    const result = await verifyAccessToken(issued.refreshToken, CONFIG, NOW);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('WRONG_TYPE');
  });

  it('access token is rejected when verified as refresh', async () => {
    const issued = await issueTokens({
      principal: CLIENT_PRINCIPAL,
      config: CONFIG,
      now: NOW,
    });
    const result = await verifyRefreshToken(issued.accessToken, CONFIG, NOW);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('WRONG_TYPE');
  });

  it('rejects tampered signature', async () => {
    const issued = await issueTokens({
      principal: CLIENT_PRINCIPAL,
      config: CONFIG,
      now: NOW,
    });
    const [header, payload] = issued.accessToken.split('.');
    const tampered = `${header}.${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const result = await verifyAccessToken(tampered as string, CONFIG, NOW);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_SIGNATURE');
  });

  it('rejects expired access token beyond skew', async () => {
    const issued = await issueTokens({
      principal: CLIENT_PRINCIPAL,
      config: CONFIG,
      now: NOW,
    });
    const result = await verifyAccessToken(
      issued.accessToken,
      CONFIG,
      NOW + issued.expiresIn + 60,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('EXPIRED');
  });

  it('accepts token within clock skew window', async () => {
    const issued = await issueTokens({
      principal: CLIENT_PRINCIPAL,
      config: CONFIG,
      now: NOW,
    });
    const result = await verifyAccessToken(
      issued.accessToken,
      CONFIG,
      NOW + issued.expiresIn + 2,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects wrong issuer as invalid signature', async () => {
    const issued = await issueTokens({
      principal: CLIENT_PRINCIPAL,
      config: CONFIG,
      now: NOW,
    });
    const wrong = { ...CONFIG, issuer: 'someone-else' };
    const result = await verifyAccessToken(issued.accessToken, wrong, NOW);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_SIGNATURE');
  });

  it('rejects malformed tokens', async () => {
    const cases = ['not-a-token', 'a.b', 'a.b.c.d', '', 'a..c'];
    for (const token of cases) {
      const result = await verifyAccessToken(token, CONFIG, NOW);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('MALFORMED');
    }
  });

  it('refresh token verifies as refresh', async () => {
    const issued = await issueTokens({
      principal: OWNER_PRINCIPAL,
      config: CONFIG,
      now: NOW,
    });
    const result = await verifyRefreshToken(issued.refreshToken, CONFIG, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims?.tokenType).toBe('refresh');
    }
  });

  it.each<Audience>(['owner-console', 'client-portal'])(
    'issues tokens for audience %s',
    async (audience) => {
      const issued = await issueTokens({
        principal: principalFor(audience),
        config: CONFIG,
        now: NOW,
      });
      const result = await verifyAccessToken(issued.accessToken, CONFIG, NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.claims?.aud).toBe(audience);
      }
    },
  );

  it('decodeTokenUnsafe exposes payload without verification', async () => {
    const issued = await issueTokens({
      principal: CLIENT_PRINCIPAL,
      config: CONFIG,
      now: NOW,
    });
    const decoded = decodeTokenUnsafe(issued.accessToken);
    expect(decoded?.sub).toBe(CLIENT_PRINCIPAL.id);
    expect(decodeTokenUnsafe('garbage')).toBeNull();
  });
});

describe('extractBearerToken', () => {
  it('extracts token from Bearer header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('is case-insensitive on the scheme', () => {
    expect(extractBearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('BEARER abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns null for missing or malformed header', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('abc.def.ghi')).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
  });
});

describe('password hashing (PBKDF2)', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('pbkdf2$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('produces unique salts for the same password', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same password', a)).toBe(true);
    expect(await verifyPassword('same password', b)).toBe(true);
  });

  it('rejects malformed stored hash', async () => {
    expect(await verifyPassword('x', 'not-a-valid-hash')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2$abc')).toBe(false);
  });
});
