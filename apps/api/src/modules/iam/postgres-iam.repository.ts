import { Inject, Injectable } from '@nestjs/common';

import type { ClientRole } from '@chai/auth';
import { withTenantTransaction, type Database } from '@chai/database';
import {
  acceptInvitation,
  createMembership,
  listMemberships,
  revokeMembership,
  updateMembershipRole,
  type Membership,
} from '@chai/domain';

import {
  DATABASE,
  SERVICE_PRINCIPAL_ID,
} from '../../database/database.module';
import type { InviteMemberInput, TeamMember } from './iam.repository';
import { IamRepository } from './iam.repository';

@Injectable()
export class PostgresIamRepository extends IamRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listMemberships(tenantId: string): Promise<TeamMember[]> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => (await listMemberships(tx)).map((row) => this.map(row)),
    );
  }

  override async createMembership(
    tenantId: string,
    input: InviteMemberInput,
  ): Promise<TeamMember> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => this.map(await createMembership(tx, input)),
    );
  }

  override async updateMembershipRole(
    tenantId: string,
    membershipId: string,
    role: ClientRole,
  ): Promise<TeamMember | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const row = await updateMembershipRole(tx, membershipId, role);
        return row ? this.map(row) : null;
      },
    );
  }

  override async revokeMembership(
    tenantId: string,
    membershipId: string,
  ): Promise<TeamMember | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const row = await revokeMembership(tx, membershipId);
        return row ? this.map(row) : null;
      },
    );
  }

  override async acceptInvitation(
    tenantId: string,
    membershipId: string,
  ): Promise<TeamMember | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const row = await acceptInvitation(tx, membershipId);
        return row ? this.map(row) : null;
      },
    );
  }

  private map(row: Membership): TeamMember {
    return {
      id: row.id,
      role: row.role,
      status: row.status,
      userId: row.userId,
    };
  }
}
