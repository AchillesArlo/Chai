import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';
import { IamModule } from '../src/modules/iam/iam.module';
import {
  IamRepository,
  type TeamMember,
} from '../src/modules/iam/iam.repository';
import type { InMemoryIamRepository } from '../src/modules/iam/in-memory-iam.repository';

const CLIENT_TENANT_ID = '01890f47-9b3c-7cc2-98e8-123456789203';
const OTHER_TENANT_ID = '01890f47-9b3c-7cc2-98e8-123456789204';
const INVITED_MEMBERSHIP_ID = '01890f47-9b3c-7cc2-98e8-123456789331';
const INVITED_USER_ID = '01890f47-9b3c-7cc2-98e8-123456789332';

describe('team management API (IAM)', () => {
  let app: NestFastifyApplication;
  let repository: InMemoryIamRepository;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    repository = app.select(IamModule).get(IamRepository) as InMemoryIamRepository;
    repository.seed({
      id: INVITED_MEMBERSHIP_ID,
      role: 'CLIENT_AGENT',
      status: 'INVITED',
      tenantId: CLIENT_TENANT_ID,
      userId: INVITED_USER_ID,
    });
    repository.seed({
      role: 'CLIENT_OWNER',
      tenantId: OTHER_TENANT_ID,
      userId: '01890f47-9b3c-7cc2-98e8-123456789333',
    });
  });

  afterAll(async () => app.close());

  it('lists the current tenant team for an owner role', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/team',
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data as TeamMember[];
    expect(data.every((member) => member.userId !== undefined)).toBe(true);
    expect(data.map((member) => member.id)).toContain(INVITED_MEMBERSHIP_ID);
    // Other tenant's membership must never leak.
    expect(data.every((member) => member.userId !== '01890f47-9b3c-7cc2-98e8-123456789333')).toBe(true);
  });

  it('rejects team management for a role without the manage permission', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'invite-viewer-001',
        'x-test-subject': 'local|client-viewer',
      },
      method: 'POST',
      payload: { role: 'CLIENT_VIEWER', userId: INVITED_USER_ID },
      url: '/api/client/v1/team',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('PERMISSION_DENIED');
  });

  it('rejects a viewer reading the team roster', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-viewer' },
      method: 'GET',
      url: '/api/client/v1/team',
    });

    expect(response.statusCode).toBe(403);
  });

  it('invites, updates, accepts, and revokes a member as an owner', async () => {
    const invite = await app.inject({
      headers: {
        'idempotency-key': 'invite-owner-001',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { role: 'CLIENT_AGENT', userId: '01890f47-9b3c-7cc2-98e8-123456789340' },
      url: '/api/client/v1/team',
    });
    expect(invite.statusCode).toBe(201);
    const invited = invite.json().data as TeamMember;
    expect(invited.status).toBe('INVITED');
    expect(invited.role).toBe('CLIENT_AGENT');

    const promoted = await app.inject({
      headers: {
        'idempotency-key': 'promote-owner-002',
        'x-test-subject': 'local|client-owner',
      },
      method: 'PATCH',
      payload: { role: 'CLIENT_MANAGER' },
      url: `/api/client/v1/team/${invited.id}`,
    });
    expect(promoted.statusCode).toBe(200);
    expect((promoted.json().data as TeamMember).role).toBe('CLIENT_MANAGER');

    const accepted = await app.inject({
      headers: {
        'idempotency-key': 'accept-owner-003',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      url: `/api/client/v1/team/${invited.id}/accept`,
    });
    expect(accepted.statusCode).toBe(200);
    expect((accepted.json().data as TeamMember).status).toBe('ACTIVE');

    const revoked = await app.inject({
      headers: {
        'idempotency-key': 'revoke-owner-004',
        'x-test-subject': 'local|client-owner',
      },
      method: 'DELETE',
      url: `/api/client/v1/team/${invited.id}`,
    });
    expect(revoked.statusCode).toBe(204);
  });

  it('returns 404 for a membership id from another tenant', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'promote-other-005',
        'x-test-subject': 'local|client-owner',
      },
      method: 'PATCH',
      payload: { role: 'CLIENT_ADMIN' },
      url: '/api/client/v1/team/01890f47-9b3c-7cc2-98e8-123456789390',
    });

    expect(response.statusCode).toBe(404);
  });

  it('forbids the owner audience from the client team route', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|owner' },
      method: 'GET',
      url: '/api/client/v1/team',
    });

    expect(response.statusCode).toBe(403);
  });
});
