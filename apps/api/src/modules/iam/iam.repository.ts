import type { ClientRole, MembershipStatus } from '@chai/auth';

/**
 * Team membership as exposed by the API layer. Tenant id is implicit — every
 * operation is scoped to the request's tenant context, never an argument.
 */
export interface TeamMember {
  id: string;
  role: ClientRole;
  status: MembershipStatus;
  userId: string;
}

export interface InviteMemberInput {
  role: ClientRole;
  userId: string;
}

/**
 * Repository port for the IAM module. The default in-memory implementation
 * keeps the API e2e suite DB-free and deterministic; a database-backed
 * implementation (wrapping @chai/domain memberships under withTenantTransaction)
 * is wired when the API gains a runtime database connection.
 */
export abstract class IamRepository {
  abstract listMemberships(tenantId: string): Promise<TeamMember[]>;
  abstract createMembership(
    tenantId: string,
    input: InviteMemberInput,
  ): Promise<TeamMember>;
  abstract updateMembershipRole(
    tenantId: string,
    membershipId: string,
    role: ClientRole,
  ): Promise<TeamMember | null>;
  abstract revokeMembership(
    tenantId: string,
    membershipId: string,
  ): Promise<TeamMember | null>;
  abstract acceptInvitation(
    tenantId: string,
    membershipId: string,
  ): Promise<TeamMember | null>;
}
