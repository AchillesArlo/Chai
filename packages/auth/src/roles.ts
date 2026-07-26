import type { Audience } from './audiences';

export const CLIENT_ROLES = [
  'CLIENT_OWNER',
  'CLIENT_ADMIN',
  'CLIENT_MANAGER',
  'CLIENT_AGENT',
  'CLIENT_ANALYST',
  'CLIENT_VIEWER',
] as const;

export const PLATFORM_ROLES = [
  'PLATFORM_OWNER',
  'PLATFORM_ADMIN',
  'SUPPORT',
  'BILLING',
  'AUDITOR',
] as const;

export type ClientRole = (typeof CLIENT_ROLES)[number];
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type PrincipalKind = 'USER' | 'SERVICE';
export type PrincipalStatus = 'ACTIVE' | 'DISABLED' | 'SUSPENDED';
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type MfaState = 'REQUIRED' | 'ENROLLED' | 'RECOVERY';

export interface OwnerTenantScope {
  expiresAt: Date;
  reason: string;
  tenantId: string;
}

interface BasePrincipal {
  audience: Audience;
  authenticatedAt: Date;
  id: string;
  recoveredAt?: Date;
  status: PrincipalStatus;
}

export interface UserPrincipal extends BasePrincipal {
  kind: 'USER';
  membership?: {
    role: ClientRole;
    status: MembershipStatus;
    tenantId: string;
  };
  mfaState?: MfaState;
  ownerTenantScope?: OwnerTenantScope;
  platformRole?: PlatformRole;
}

export interface ServicePrincipal extends BasePrincipal {
  kind: 'SERVICE';
  scopes: readonly string[];
  tenantId?: string;
}

export type Principal = UserPrincipal | ServicePrincipal;
