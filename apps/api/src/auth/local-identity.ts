import type { FastifyInstance } from 'fastify';

import {
  createLocalIdentityAdapter,
  type LocalIdentityRecord,
} from '@chai/auth';

const TENANT_ID = '01890f47-9b3c-7cc2-98e8-123456789203';
const activeClientMembership = {
  role: 'CLIENT_OWNER' as const,
  status: 'ACTIVE' as const,
  tenantId: TENANT_ID,
};
const PRINCIPALS: readonly LocalIdentityRecord[] = [
  {
    principal: {
      audience: 'owner-console',
      authenticatedAt: new Date(),
      id: '01890f47-9b3c-7cc2-98e8-123456789202',
      kind: 'USER',
      mfaState: 'ENROLLED',
      ownerTenantScope: {
        expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
        reason: 'Synthetic owner tenant support session',
        tenantId: TENANT_ID,
      },
      platformRole: 'PLATFORM_OWNER',
      status: 'ACTIVE',
    },
    subject: 'local|owner',
  },
  {
    principal: {
      audience: 'client-portal',
      authenticatedAt: new Date(),
      id: '01890f47-9b3c-7cc2-98e8-123456789205',
      kind: 'USER',
      membership: activeClientMembership,
      status: 'ACTIVE',
    },
    subject: 'local|client-owner',
  },
  {
    principal: {
      audience: 'owner-console',
      authenticatedAt: new Date(),
      id: '01890f47-9b3c-7cc2-98e8-123456789206',
      kind: 'USER',
      mfaState: 'ENROLLED',
      platformRole: 'PLATFORM_OWNER',
      status: 'DISABLED',
    },
    subject: 'local|owner-disabled',
  },
  {
    principal: {
      audience: 'owner-console',
      authenticatedAt: new Date(),
      id: '01890f47-9b3c-7cc2-98e8-123456789207',
      kind: 'USER',
      mfaState: 'ENROLLED',
      status: 'ACTIVE',
    },
    subject: 'local|owner-roleless',
  },
  {
    principal: {
      audience: 'owner-console',
      authenticatedAt: new Date(),
      id: '01890f47-9b3c-7cc2-98e8-123456789208',
      kind: 'SERVICE',
      scopes: ['platform.overview.read'],
      status: 'ACTIVE',
    },
    subject: 'local|owner-service',
  },
  {
    principal: {
      audience: 'owner-console',
      authenticatedAt: new Date(),
      id: '01890f47-9b3c-7cc2-98e8-123456789209',
      kind: 'USER',
      mfaState: 'REQUIRED',
      platformRole: 'PLATFORM_OWNER',
      status: 'ACTIVE',
    },
    subject: 'local|owner-mfa-required',
  },
  {
    principal: {
      audience: 'client-portal',
      authenticatedAt: new Date(),
      id: '01890f47-9b3c-7cc2-98e8-12345678920a',
      kind: 'USER',
      membership: activeClientMembership,
      status: 'DISABLED',
    },
    subject: 'local|client-disabled',
  },
  {
    principal: {
      audience: 'client-portal',
      authenticatedAt: new Date(),
      id: '01890f47-9b3c-7cc2-98e8-12345678920b',
      kind: 'USER',
      membership: {
        ...activeClientMembership,
        status: 'REVOKED',
      },
      status: 'ACTIVE',
    },
    subject: 'local|client-revoked',
  },
  {
    principal: {
      audience: 'client-portal',
      authenticatedAt: new Date(),
      id: '01890f47-9b3c-7cc2-98e8-12345678920d',
      kind: 'USER',
      membership: { ...activeClientMembership, role: 'CLIENT_VIEWER' },
      status: 'ACTIVE',
    },
    subject: 'local|client-viewer',
  },
  {
    principal: {
      audience: 'client-portal',
      authenticatedAt: new Date(),
      id: '01890f47-9b3c-7cc2-98e8-12345678920e',
      kind: 'USER',
      membership: { ...activeClientMembership, role: 'CLIENT_AGENT' },
      status: 'ACTIVE',
    },
    subject: 'local|client-agent',
  },
  {
    principal: {
      audience: 'owner-console',
      authenticatedAt: new Date(),
      id: '01890f47-9b3c-7cc2-98e8-12345678920c',
      kind: 'USER',
      mfaState: 'ENROLLED',
      ownerTenantScope: {
        expiresAt: new Date(0),
        reason: 'Expired synthetic owner tenant support session',
        tenantId: TENANT_ID,
      },
      platformRole: 'PLATFORM_OWNER',
      status: 'ACTIVE',
    },
    subject: 'local|owner-expired-scope',
  },
];

export function registerLocalIdentityHook(
  fastify: FastifyInstance,
  environment: string,
): void {
  if (!['local', 'test'].includes(environment)) {
    return;
  }

  const adapter = createLocalIdentityAdapter({
    environment,
    principals: PRINCIPALS,
  });

  fastify.addHook('onRequest', async (request) => {
    // Token hook (registered first) may already have resolved a principal
    // from a Bearer token — do not override it with the test subject.
    if (request.principal) {
      return;
    }
    const header = request.headers['x-test-subject'];
    const subject = Array.isArray(header) ? header[0] : header;
    if (!subject) {
      return;
    }

    const record = PRINCIPALS.find((candidate) => candidate.subject === subject);
    if (record) {
      request.principal = await adapter.authenticate(
        subject,
        record.principal.audience,
      );
    }
  });
}
