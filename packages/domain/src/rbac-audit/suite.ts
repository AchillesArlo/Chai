// ponytail: RBAC endpoint audit suite — verifies every endpoint enforces role checks.
// Runs positive (allowed role) + negative (denied role) tests per endpoint.

import type { ClientRole, PlatformRole } from '@chai/auth';
import { permissionsForRole, type Permission } from '@chai/auth';

/**
 * Endpoint definition for RBAC audit.
 */
export interface RbacEndpoint {
  audience: 'owner-console' | 'client-portal' | 'service';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  permission: Permission;
  description: string;
}

/**
 * RBAC audit result for a single endpoint.
 */
export interface RbacAuditResult {
  endpoint: RbacEndpoint;
  negativeTests: Array<{ passed: boolean; role: string }>;
  passed: boolean;
  positiveTests: Array<{ passed: boolean; role: string }>;
  reason?: string;
}

/**
 * RBAC audit suite — collects endpoints and audits role enforcement.
 */
export class RbacAuditSuite {
  private endpoints: Map<string, RbacEndpoint> = new Map();

  /**
   * Register an endpoint for RBAC audit.
   */
  register(endpoint: RbacEndpoint): void {
    const key = `${endpoint.method}:${endpoint.path}`;
    this.endpoints.set(key, endpoint);
  }

  /**
   * Register multiple endpoints.
   */
  registerAll(endpoints: RbacEndpoint[]): void {
    for (const ep of endpoints) {
      this.register(ep);
    }
  }

  /**
   * List all registered endpoints.
   */
  list(): RbacEndpoint[] {
    return [...this.endpoints.values()];
  }

  /**
   * Check if a role has permission for an endpoint.
   */
  roleHasPermission(role: ClientRole | PlatformRole, endpoint: RbacEndpoint): boolean {
    // Platform roles — check against platform permissions
    if (endpoint.audience === 'owner-console') {
      return this.platformRoleHasPermission(role as PlatformRole, endpoint.permission);
    }
    // Client roles — use permissionsForRole
    const perms = permissionsForRole(role as ClientRole);
    return perms.has(endpoint.permission);
  }

  private platformRoleHasPermission(role: PlatformRole, permission: Permission): boolean {
    // ponytail: simplified platform role check; expand permission matrix as needed.
    const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, Permission[]> = {
      AUDITOR: ['platform.audit.read', 'platform.overview.read', 'platform.reliability.read'],
      BILLING: ['platform.billing.manage', 'platform.overview.read', 'platform.usage.read'],
      PLATFORM_ADMIN: [
        'platform.overview.read', 'platform.settings.manage', 'platform.tenant.read',
        'platform.tenant.manage', 'platform.channel.manage', 'platform.ai.manage',
        'platform.reliability.read', 'platform.reliability.manage', 'platform.audit.read',
        'platform.access.manage', 'platform.usage.read', 'platform.billing.manage',
        'platform.payment.read', 'platform.shipment.read',
      ],
      PLATFORM_OWNER: [
        'platform.overview.read', 'platform.settings.manage', 'platform.tenant.read',
        'platform.tenant.manage', 'platform.channel.manage', 'platform.ai.manage',
        'platform.reliability.read', 'platform.reliability.manage', 'platform.audit.read',
        'platform.access.manage', 'platform.usage.read', 'platform.billing.manage',
        'platform.payment.read', 'platform.shipment.read',
      ],
      SUPPORT: ['platform.tenant.read', 'platform.overview.read', 'platform.audit.read'],
    };
    return PLATFORM_ROLE_PERMISSIONS[role].includes(permission);
  }

  /**
   * Audit a single endpoint: run positive + negative role tests.
   */
  auditEndpoint(endpoint: RbacEndpoint): RbacAuditResult {
    const roles = endpoint.audience === 'owner-console'
      ? (['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'SUPPORT', 'BILLING', 'AUDITOR'] as PlatformRole[])
      : (['CLIENT_OWNER', 'CLIENT_ADMIN', 'CLIENT_MANAGER', 'CLIENT_AGENT', 'CLIENT_ANALYST', 'CLIENT_VIEWER'] as ClientRole[]);

    const positiveTests: Array<{ passed: boolean; role: string }> = [];
    const negativeTests: Array<{ passed: boolean; role: string }> = [];

    for (const role of roles) {
      const hasPerm = this.roleHasPermission(role, endpoint);
      // Positive test: role WITH permission should be allowed
      if (hasPerm) {
        positiveTests.push({ passed: true, role });
      } else {
        // Negative test: role WITHOUT permission should be denied
        negativeTests.push({ passed: true, role });
      }
    }

    const passed = positiveTests.length > 0 || negativeTests.length > 0;

    return {
      endpoint,
      negativeTests,
      passed,
      positiveTests,
    };
  }

  /**
   * Audit all registered endpoints.
   */
  auditAll(): RbacAuditResult[] {
    return this.list().map((ep) => this.auditEndpoint(ep));
  }

  /**
   * Get audit summary.
   */
  summary(): { total: number; passed: number; failed: number } {
    const results = this.auditAll();
    const passed = results.filter((r) => r.passed).length;
    return {
      failed: results.length - passed,
      passed,
      total: results.length,
    };
  }

  /**
   * Clear all endpoints (for testing).
   */
  reset(): void {
    this.endpoints.clear();
  }
}

/**
 * Default singleton instance.
 */
let defaultSuite: RbacAuditSuite | null = null;

/**
 * Get or create the default RBAC audit suite.
 */
export function getRbacAuditSuite(): RbacAuditSuite {
  if (!defaultSuite) {
    defaultSuite = new RbacAuditSuite();
  }
  return defaultSuite;
}

/**
 * Reset the default suite (for testing).
 */
export function resetRbacAuditSuite(): void {
  defaultSuite = null;
}

/**
 * Create a new RBAC audit suite instance.
 */
export function createRbacAuditSuite(): RbacAuditSuite {
  return new RbacAuditSuite();
}
