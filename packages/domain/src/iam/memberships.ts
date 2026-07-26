import type { ClientRole, MembershipStatus } from '@chai/auth';
import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction } from '@chai/database';

export interface Membership {
  id: string;
  role: ClientRole;
  status: MembershipStatus;
  tenantId: string;
  userId: string;
}

export interface NewMembership {
  role: ClientRole;
  userId: string;
}

interface MembershipRow {
  id: string;
  role: ClientRole;
  status: MembershipStatus;
  tenant_id: string;
  user_id: string;
}

function toMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    tenantId: row.tenant_id,
    userId: row.user_id,
  };
}

/**
 * Lists every membership visible under the current tenant context. RLS makes
 * cross-tenant rows invisible, so this is the wrong-tenant isolation boundary.
 */
export async function listMemberships(
  transaction: DatabaseTransaction,
): Promise<Membership[]> {
  const rows = await transaction<MembershipRow[]>`
    SELECT id, tenant_id, user_id, role, status
    FROM chai.membership
    ORDER BY created_at
  `;

  return rows.map(toMembership);
}

/**
 * Creates a membership pinned to the current tenant context. The tenant id is
 * taken from the transaction's `app.tenant_id` setting rather than the caller's
 * arguments, so a request can never place a membership into another tenant.
 */
export async function createMembership(
  transaction: DatabaseTransaction,
  input: NewMembership,
): Promise<Membership> {
  const rows = await transaction<MembershipRow[]>`
    INSERT INTO chai.membership (id, tenant_id, user_id, role, status)
    VALUES (${randomUUID()}, chai.current_tenant_id(), ${input.userId}, ${input.role}, 'INVITED')
    RETURNING id, tenant_id, user_id, role, status
  `;
  const row = rows[0];
  if (!row) throw new Error('membership insert returned no row');

  return toMembership(row);
}

/**
 * Updates a membership role. Returns null when the id does not exist under the
 * current tenant — the caller decides whether that surfaces as 404.
 */
export async function updateMembershipRole(
  transaction: DatabaseTransaction,
  membershipId: string,
  role: ClientRole,
): Promise<Membership | null> {
  const rows = await transaction<MembershipRow[]>`
    UPDATE chai.membership
    SET role = ${role}
    WHERE id = ${membershipId}
    RETURNING id, tenant_id, user_id, role, status
  `;
  const row = rows[0];
  return row ? toMembership(row) : null;
}

export async function revokeMembership(
  transaction: DatabaseTransaction,
  membershipId: string,
): Promise<Membership | null> {
  const rows = await transaction<MembershipRow[]>`
    UPDATE chai.membership
    SET status = 'REVOKED'
    WHERE id = ${membershipId}
    RETURNING id, tenant_id, user_id, role, status
  `;
  const row = rows[0];
  return row ? toMembership(row) : null;
}

/**
 * Accepts an outstanding invitation: flips an INVITED membership into ACTIVE.
 * Returns null if the membership is not visible under the current tenant or is
 * not in an invitable state.
 */
export async function acceptInvitation(
  transaction: DatabaseTransaction,
  membershipId: string,
): Promise<Membership | null> {
  const rows = await transaction<MembershipRow[]>`
    UPDATE chai.membership
    SET status = 'ACTIVE'
    WHERE id = ${membershipId}
      AND status = 'INVITED'
    RETURNING id, tenant_id, user_id, role, status
  `;
  const row = rows[0];
  return row ? toMembership(row) : null;
}
