import type { Audience } from './audiences';
import {
  PLATFORM_OWNER_PERMISSIONS,
  permissionAudience,
  permissionsForRole,
  type Permission,
} from './permissions';
import type { ClientRole, Principal } from './roles';
import { SESSION_POLICIES } from './session-policy';

export type AuthorizationRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DataMasking = 'NONE' | 'STANDARD' | 'SENSITIVE' | 'AGGREGATE_ONLY';
export type AuthorizationDenialReason =
  | 'WRONG_AUDIENCE'
  | 'PRINCIPAL_INACTIVE'
  | 'MFA_REQUIRED'
  | 'MEMBERSHIP_INACTIVE'
  | 'WRONG_TENANT'
  | 'PERMISSION_DENIED'
  | 'NOT_ASSIGNED'
  | 'FEATURE_NOT_ENABLED'
  | 'INVALID_STATE'
  | 'VERSION_CONFLICT'
  | 'RECENT_AUTH_REQUIRED'
  | 'RECOVERY_COOLDOWN'
  | 'APPROVAL_REQUIRED'
  | 'APPROVER_ROLE_INVALID'
  | 'SELF_APPROVAL_FORBIDDEN'
  | 'SELF_APPROVAL_REASON_REQUIRED';

export type ApprovalRole = ClientRole | 'PLATFORM_OWNER';

export interface AuthorizationApproval {
  allowSelfApproval?: boolean;
  approvedAt?: Date;
  approvedBy?: string;
  approvedByRole?: ApprovalRole;
  reason?: string;
  requiredRole: ApprovalRole;
}

export interface AuthorizationResource {
  assignedPrincipalId?: string;
  state?: string;
  tenantId: string;
  version?: number;
}

export interface AuthorizationRequest {
  allowedStates?: readonly string[];
  approval?: AuthorizationApproval;
  audience: Audience;
  enabledEntitlements?: readonly string[];
  expectedVersion?: number;
  now: Date;
  permission: Permission;
  principal: Principal;
  recentAuthenticationRequired?: boolean;
  requiredEntitlement?: string;
  requiredRelationship?: 'ASSIGNED';
  resource?: AuthorizationResource;
  risk?: AuthorizationRisk;
}

export type AuthorizationDecision =
  | { allowed: true; masking: DataMasking }
  | { allowed: false; reason: AuthorizationDenialReason };

function deny(reason: AuthorizationDenialReason): AuthorizationDecision {
  return { allowed: false, reason };
}

function maskingFor(principal: Principal): DataMasking {
  if (principal.kind === 'SERVICE' || principal.audience === 'owner-console') {
    return 'NONE';
  }

  const role = principal.membership?.role;
  if (role === 'CLIENT_OWNER' || role === 'CLIENT_ADMIN') {
    return 'NONE';
  }
  if (role === 'CLIENT_ANALYST') {
    return 'SENSITIVE';
  }
  if (role === 'CLIENT_VIEWER') {
    return 'AGGREGATE_ONLY';
  }
  return 'STANDARD';
}

function hasPermission(request: AuthorizationRequest): boolean {
  const { permission, principal } = request;

  if (principal.kind === 'SERVICE') {
    return principal.scopes.includes(permission);
  }
  if (principal.platformRole === 'PLATFORM_OWNER') {
    return PLATFORM_OWNER_PERMISSIONS.has(permission);
  }
  if (principal.membership) {
    return permissionsForRole(principal.membership.role).has(permission);
  }
  return false;
}

function principalTenant(principal: Principal): string | undefined {
  if (principal.kind === 'SERVICE') {
    return principal.tenantId;
  }
  return principal.membership?.tenantId;
}

export function authorize(
  request: AuthorizationRequest,
): AuthorizationDecision {
  const { principal } = request;

  if (
    request.audience !== principal.audience ||
    permissionAudience(request.permission) !== request.audience
  ) {
    return deny('WRONG_AUDIENCE');
  }
  if (principal.status !== 'ACTIVE') {
    return deny('PRINCIPAL_INACTIVE');
  }
  if (
    principal.kind === 'USER' &&
    principal.audience === 'owner-console' &&
    principal.platformRole === 'PLATFORM_OWNER' &&
    principal.mfaState !== 'ENROLLED'
  ) {
    return deny('MFA_REQUIRED');
  }
  if (
    principal.kind === 'USER' &&
    principal.audience === 'client-portal' &&
    principal.membership?.status !== 'ACTIVE'
  ) {
    return deny('MEMBERSHIP_INACTIVE');
  }
  if (
    request.resource &&
    principalTenant(principal) !== request.resource.tenantId
  ) {
    return deny('WRONG_TENANT');
  }
  if (!hasPermission(request)) {
    return deny('PERMISSION_DENIED');
  }
  if (
    request.requiredRelationship === 'ASSIGNED' &&
    request.resource?.assignedPrincipalId !== principal.id
  ) {
    return deny('NOT_ASSIGNED');
  }
  if (
    request.requiredEntitlement &&
    !request.enabledEntitlements?.includes(request.requiredEntitlement)
  ) {
    return deny('FEATURE_NOT_ENABLED');
  }
  if (
    request.allowedStates &&
    (!request.resource?.state ||
      !request.allowedStates.includes(request.resource.state))
  ) {
    return deny('INVALID_STATE');
  }
  if (
    request.expectedVersion !== undefined &&
    request.resource?.version !== request.expectedVersion
  ) {
    return deny('VERSION_CONFLICT');
  }

  const millisecondsSinceAuthentication =
    request.now.getTime() - principal.authenticatedAt.getTime();
  if (
    request.recentAuthenticationRequired &&
    (millisecondsSinceAuthentication < 0 ||
      millisecondsSinceAuthentication >
        SESSION_POLICIES.recentAuthenticationSeconds * 1_000)
  ) {
    return deny('RECENT_AUTH_REQUIRED');
  }

  if (
    request.risk === 'CRITICAL' &&
    principal.recoveredAt &&
    request.now.getTime() - principal.recoveredAt.getTime() <
      SESSION_POLICIES.recoveryCooldownSeconds * 1_000
  ) {
    return deny('RECOVERY_COOLDOWN');
  }

  if (request.approval) {
    const approval = request.approval;
    if (
      !approval.approvedAt ||
      !approval.approvedBy ||
      !approval.approvedByRole
    ) {
      return deny('APPROVAL_REQUIRED');
    }
    if (approval.approvedByRole !== approval.requiredRole) {
      return deny('APPROVER_ROLE_INVALID');
    }
    if (approval.approvedBy === principal.id) {
      if (
        approval.allowSelfApproval !== true ||
        request.risk === 'HIGH' ||
        request.risk === 'CRITICAL'
      ) {
        return deny('SELF_APPROVAL_FORBIDDEN');
      }
      if (!approval.reason?.trim()) {
        return deny('SELF_APPROVAL_REASON_REQUIRED');
      }
    }
  }

  return { allowed: true, masking: maskingFor(principal) };
}
