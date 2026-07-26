import { describe, expect, it } from 'vitest';

import {
  CLIENT_ROLES,
  SESSION_POLICIES,
  authorize,
  createLocalIdentityAdapter,
  permissionsForRole,
  type AuthorizationRequest,
  type ClientRole,
  type Principal,
} from './index';

const IDS = {
  approver: '01890f47-9b3c-7cc2-98e8-123456789201',
  principal: '01890f47-9b3c-7cc2-98e8-123456789202',
  tenantA: '01890f47-9b3c-7cc2-98e8-123456789203',
  tenantB: '01890f47-9b3c-7cc2-98e8-123456789204',
} as const;

const NOW = new Date('2026-07-16T10:00:00.000Z');

function clientPrincipal(role: ClientRole): Principal {
  return {
    audience: 'client-portal',
    authenticatedAt: new Date('2026-07-16T09:55:00.000Z'),
    id: IDS.principal,
    kind: 'USER',
    membership: {
      role,
      status: 'ACTIVE',
      tenantId: IDS.tenantA,
    },
    status: 'ACTIVE',
  };
}

function request(
  principal: Principal,
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest {
  return {
    audience: principal.audience,
    now: NOW,
    permission: 'tenant.profile.read',
    principal,
    resource: { tenantId: IDS.tenantA },
    ...overrides,
  };
}

describe('canonical roles and permissions', () => {
  it('includes Client Admin in the six canonical client roles', () => {
    expect(CLIENT_ROLES).toEqual([
      'CLIENT_OWNER',
      'CLIENT_ADMIN',
      'CLIENT_MANAGER',
      'CLIENT_AGENT',
      'CLIENT_ANALYST',
      'CLIENT_VIEWER',
    ]);
  });

  it.each([
    ['CLIENT_OWNER', 'tenant.team.manage', true],
    ['CLIENT_ADMIN', 'channel.manage', true],
    ['CLIENT_MANAGER', 'inbox.manage', true],
    ['CLIENT_MANAGER', 'tenant.team.manage', false],
    ['CLIENT_AGENT', 'conversation.respond', true],
    ['CLIENT_AGENT', 'analytics.export', false],
    ['CLIENT_ANALYST', 'analytics.export', true],
    ['CLIENT_ANALYST', 'conversation.respond', false],
    ['CLIENT_VIEWER', 'analytics.read', true],
    ['CLIENT_VIEWER', 'contact.read', false],
  ] as const)(
    'maps %s permission %s to %s',
    (role, permission, expected) => {
      expect(permissionsForRole(role).has(permission)).toBe(expected);
    },
  );
});

describe('authorization boundaries', () => {
  it('rejects a permission from another token audience', () => {
    const owner: Principal = {
      audience: 'owner-console',
      authenticatedAt: NOW,
      id: IDS.principal,
      kind: 'USER',
      mfaState: 'ENROLLED',
      platformRole: 'PLATFORM_OWNER',
      status: 'ACTIVE',
    };

    expect(
      authorize(
        request(owner, {
          audience: 'owner-console',
          permission: 'tenant.profile.read',
        }),
      ),
    ).toMatchObject({ allowed: false, reason: 'WRONG_AUDIENCE' });
  });

  it('rejects cross-tenant resources before role permission is applied', () => {
    expect(
      authorize(
        request(clientPrincipal('CLIENT_OWNER'), {
          resource: { tenantId: IDS.tenantB },
        }),
      ),
    ).toMatchObject({ allowed: false, reason: 'WRONG_TENANT' });
  });

  it('rejects disabled principals and memberships', () => {
    const disabled = clientPrincipal('CLIENT_OWNER');
    disabled.status = 'DISABLED';

    expect(authorize(request(disabled))).toMatchObject({
      allowed: false,
      reason: 'PRINCIPAL_INACTIVE',
    });

    const revoked = clientPrincipal('CLIENT_OWNER');
    if (revoked.kind === 'USER' && revoked.membership) {
      revoked.membership.status = 'REVOKED';
    }

    expect(authorize(request(revoked))).toMatchObject({
      allowed: false,
      reason: 'MEMBERSHIP_INACTIVE',
    });
  });

  it('enforces assignment, entitlement, state, and expected version', () => {
    const principal = clientPrincipal('CLIENT_AGENT');
    const base = {
      audience: 'client-portal' as const,
      now: NOW,
      permission: 'conversation.respond' as const,
      principal,
      resource: {
        assignedPrincipalId: IDS.approver,
        state: 'OPEN',
        tenantId: IDS.tenantA,
        version: 4,
      },
    };

    expect(
      authorize({ ...base, requiredRelationship: 'ASSIGNED' }),
    ).toMatchObject({ allowed: false, reason: 'NOT_ASSIGNED' });

    expect(
      authorize({
        ...base,
        requiredEntitlement: 'ai-customer-service',
      }),
    ).toMatchObject({ allowed: false, reason: 'FEATURE_NOT_ENABLED' });

    expect(
      authorize({ ...base, allowedStates: ['HUMAN_ACTIVE'] }),
    ).toMatchObject({ allowed: false, reason: 'INVALID_STATE' });

    expect(authorize({ ...base, expectedVersion: 3 })).toMatchObject({
      allowed: false,
      reason: 'VERSION_CONFLICT',
    });
  });

  it('allows an assigned active agent with the required entitlement', () => {
    const principal = clientPrincipal('CLIENT_AGENT');

    expect(
      authorize({
        audience: 'client-portal',
        allowedStates: ['HUMAN_ACTIVE'],
        enabledEntitlements: ['ai-customer-service'],
        expectedVersion: 4,
        now: NOW,
        permission: 'conversation.respond',
        principal,
        requiredEntitlement: 'ai-customer-service',
        requiredRelationship: 'ASSIGNED',
        resource: {
          assignedPrincipalId: IDS.principal,
          state: 'HUMAN_ACTIVE',
          tenantId: IDS.tenantA,
          version: 4,
        },
      }),
    ).toEqual({ allowed: true, masking: 'STANDARD' });
  });

  it('returns role-appropriate masking for read access', () => {
    expect(authorize(request(clientPrincipal('CLIENT_OWNER')))).toEqual({
      allowed: true,
      masking: 'NONE',
    });
    expect(authorize(request(clientPrincipal('CLIENT_ANALYST')))).toEqual({
      allowed: true,
      masking: 'SENSITIVE',
    });
    expect(authorize(request(clientPrincipal('CLIENT_VIEWER')))).toEqual({
      allowed: true,
      masking: 'AGGREGATE_ONLY',
    });
  });
});

describe('recent authentication and approval', () => {
  it('requires enrolled MFA for the Platform Owner', () => {
    const owner: Principal = {
      audience: 'owner-console',
      authenticatedAt: NOW,
      id: IDS.principal,
      kind: 'USER',
      mfaState: 'REQUIRED',
      platformRole: 'PLATFORM_OWNER',
      status: 'ACTIVE',
    };

    expect(
      authorize({
        audience: 'owner-console',
        now: NOW,
        permission: 'platform.overview.read',
        principal: owner,
      }),
    ).toMatchObject({ allowed: false, reason: 'MFA_REQUIRED' });

    owner.mfaState = 'ENROLLED';
    expect(
      authorize({
        audience: 'owner-console',
        now: NOW,
        permission: 'platform.overview.read',
        principal: owner,
      }),
    ).toEqual({ allowed: true, masking: 'NONE' });
  });

  it('enforces the ten-minute recent authentication window', () => {
    const principal = clientPrincipal('CLIENT_OWNER');
    principal.authenticatedAt = new Date('2026-07-16T09:49:59.000Z');

    expect(
      authorize(request(principal, { recentAuthenticationRequired: true })),
    ).toMatchObject({ allowed: false, reason: 'RECENT_AUTH_REQUIRED' });

    principal.authenticatedAt = new Date('2026-07-16T09:50:00.000Z');
    expect(
      authorize(request(principal, { recentAuthenticationRequired: true })),
    ).toMatchObject({ allowed: true });
  });

  it('blocks critical actions during the recovery cooldown', () => {
    const principal = clientPrincipal('CLIENT_OWNER');
    principal.recoveredAt = new Date('2026-07-16T09:00:00.000Z');

    expect(authorize(request(principal, { risk: 'CRITICAL' }))).toMatchObject({
      allowed: false,
      reason: 'RECOVERY_COOLDOWN',
    });
  });

  it('requires an independent Client Owner approval for high-risk tenant actions', () => {
    const principal = clientPrincipal('CLIENT_ADMIN');
    const highRisk = request(principal, {
      approval: { requiredRole: 'CLIENT_OWNER' },
      permission: 'payment.manage',
      recentAuthenticationRequired: true,
      risk: 'HIGH',
    });

    expect(authorize(highRisk)).toMatchObject({
      allowed: false,
      reason: 'APPROVAL_REQUIRED',
    });

    expect(
      authorize({
        ...highRisk,
        approval: {
          approvedAt: NOW,
          approvedBy: IDS.approver,
          approvedByRole: 'CLIENT_OWNER',
          requiredRole: 'CLIENT_OWNER',
        },
      }),
    ).toMatchObject({ allowed: true });
  });

  it('rejects self-approval unless policy explicitly permits it', () => {
    const principal = clientPrincipal('CLIENT_OWNER');
    const approval = {
      approvedAt: NOW,
      approvedBy: IDS.principal,
      approvedByRole: 'CLIENT_OWNER' as const,
      requiredRole: 'CLIENT_OWNER' as const,
    };

    expect(
      authorize(
        request(principal, {
          approval,
          permission: 'payment.approve',
          risk: 'HIGH',
        }),
      ),
    ).toMatchObject({ allowed: false, reason: 'SELF_APPROVAL_FORBIDDEN' });

    expect(
      authorize(
        request(principal, {
          approval: { ...approval, allowSelfApproval: true },
          permission: 'platform.settings.manage',
          resource: undefined,
          risk: 'MEDIUM',
        }),
      ),
    ).toMatchObject({ allowed: false, reason: 'WRONG_AUDIENCE' });
  });

  it('allows reversible owner self-approval only with an audit reason', () => {
    const owner: Principal = {
      audience: 'owner-console',
      authenticatedAt: new Date('2026-07-16T09:55:00.000Z'),
      id: IDS.principal,
      kind: 'USER',
      mfaState: 'ENROLLED',
      platformRole: 'PLATFORM_OWNER',
      status: 'ACTIVE',
    };
    const approval = {
      allowSelfApproval: true,
      approvedAt: NOW,
      approvedBy: IDS.principal,
      approvedByRole: 'PLATFORM_OWNER' as const,
      requiredRole: 'PLATFORM_OWNER' as const,
    };

    expect(
      authorize({
        approval,
        audience: 'owner-console',
        now: NOW,
        permission: 'platform.settings.manage',
        principal: owner,
        recentAuthenticationRequired: true,
        risk: 'MEDIUM',
      }),
    ).toMatchObject({
      allowed: false,
      reason: 'SELF_APPROVAL_REASON_REQUIRED',
    });

    expect(
      authorize({
        approval: { ...approval, reason: 'Rotate reversible routing policy' },
        audience: 'owner-console',
        now: NOW,
        permission: 'platform.settings.manage',
        principal: owner,
        recentAuthenticationRequired: true,
        risk: 'MEDIUM',
      }),
    ).toEqual({ allowed: true, masking: 'NONE' });
  });
});

describe('service and local identities', () => {
  it('requires an explicit permission scope for service identities', () => {
    const service: Principal = {
      audience: 'service',
      authenticatedAt: NOW,
      id: IDS.principal,
      kind: 'SERVICE',
      scopes: ['event.publish'],
      status: 'ACTIVE',
      tenantId: IDS.tenantA,
    };

    expect(
      authorize(
        request(service, {
          audience: 'service',
          permission: 'event.publish',
        }),
      ),
    ).toMatchObject({ allowed: true });
    expect(
      authorize(
        request(service, {
          audience: 'service',
          permission: 'outbox.dispatch',
        }),
      ),
    ).toMatchObject({ allowed: false, reason: 'PERMISSION_DENIED' });
  });

  it('enables synthetic identities only in local and test environments', async () => {
    expect(() =>
      createLocalIdentityAdapter({ environment: 'production', principals: [] }),
    ).toThrow(/local or test/i);

    const principal = clientPrincipal('CLIENT_OWNER');
    const adapter = createLocalIdentityAdapter({
      environment: 'test',
      principals: [{ principal, subject: 'local|owner' }],
    });

    await expect(
      adapter.authenticate('local|owner', 'client-portal'),
    ).resolves.toEqual(principal);
    await expect(
      adapter.authenticate('local|owner', 'owner-console'),
    ).rejects.toThrow(/audience/i);
  });

  it('pins the accepted session policy durations', () => {
    expect(SESSION_POLICIES).toMatchObject({
      client: {
        absoluteLifetimeSeconds: 43_200,
        accessTokenLifetimeSeconds: 900,
        idleTimeoutSeconds: 3_600,
      },
      owner: {
        absoluteLifetimeSeconds: 28_800,
        accessTokenLifetimeSeconds: 600,
        idleTimeoutSeconds: 1_800,
      },
      recentAuthenticationSeconds: 600,
      recoveryCooldownSeconds: 86_400,
      serviceAccessTokenLifetimeSeconds: 300,
    });
  });
});
