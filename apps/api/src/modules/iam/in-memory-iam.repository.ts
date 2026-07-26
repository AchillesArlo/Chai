import { randomUUID } from 'node:crypto';

import type { ClientRole } from '@chai/auth';

import { IamRepository } from './iam.repository';
import type { InviteMemberInput, TeamMember } from './iam.repository';

interface Record {
  id: string;
  role: ClientRole;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  tenantId: string;
  userId: string;
}

/**
 * In-memory IamRepository used by the API e2e suite and local development.
 *
 * ponytail: a database-backed implementation replaces this once the API has a
 * runtime database connection. The repository contract stays identical, so the
 * controller and tests do not change.
 */
export class InMemoryIamRepository extends IamRepository {
  private readonly records = new Map<string, Record>();

  seed(membership: {
    id?: string;
    role: ClientRole;
    status?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
    tenantId: string;
    userId: string;
  }): TeamMember {
    const record: Record = {
      id: membership.id ?? randomUUID(),
      role: membership.role,
      status: membership.status ?? 'ACTIVE',
      tenantId: membership.tenantId,
      userId: membership.userId,
    };
    this.records.set(record.id, record);
    return this.toMember(record);
  }

  override async listMemberships(tenantId: string): Promise<TeamMember[]> {
    return [...this.records.values()]
      .filter((record) => record.tenantId === tenantId)
      .map((record) => this.toMember(record));
  }

  override async createMembership(
    tenantId: string,
    input: InviteMemberInput,
  ): Promise<TeamMember> {
    return this.seed({
      role: input.role,
      status: 'INVITED',
      tenantId,
      userId: input.userId,
    });
  }

  override async updateMembershipRole(
    tenantId: string,
    membershipId: string,
    role: ClientRole,
  ): Promise<TeamMember | null> {
    const record = this.find(tenantId, membershipId);
    if (!record) return null;
    record.role = role;
    return this.toMember(record);
  }

  override async revokeMembership(
    tenantId: string,
    membershipId: string,
  ): Promise<TeamMember | null> {
    const record = this.find(tenantId, membershipId);
    if (!record) return null;
    record.status = 'REVOKED';
    return this.toMember(record);
  }

  override async acceptInvitation(
    tenantId: string,
    membershipId: string,
  ): Promise<TeamMember | null> {
    const record = this.find(tenantId, membershipId);
    if (!record || record.status !== 'INVITED') return null;
    record.status = 'ACTIVE';
    return this.toMember(record);
  }

  private find(tenantId: string, membershipId: string): Record | undefined {
    const record = this.records.get(membershipId);
    if (!record || record.tenantId !== tenantId) return undefined;
    return record;
  }

  private toMember(record: Record): TeamMember {
    return {
      id: record.id,
      role: record.role,
      status: record.status,
      userId: record.userId,
    };
  }
}
