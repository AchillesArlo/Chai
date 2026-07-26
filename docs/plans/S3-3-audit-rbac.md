# S3-3: Audit Trail & RBAC Completion

## Overview
This document describes the implementation of complete audit trail and RBAC permission matrix for the Chai platform.

## Audit Log Schema

### Table: `chai.audit_log`

```sql
CREATE TABLE chai.audit_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  actor_id uuid NOT NULL REFERENCES chai.user_account(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Indexes
- `audit_log_tenant_created_idx` ON `(tenant_id, created_at DESC)`
- `audit_log_actor_created_idx` ON `(actor_id, created_at DESC)`
- `audit_log_resource_idx` ON `(resource_type, resource_id)`

### RLS Policies
- **Insert**: Users can insert audit logs for their tenant
- **Select**: Users can read audit logs for their tenant
- **No Update/Delete**: Append-only audit trail

### Grants
- `chai_app_runtime`: INSERT, SELECT
- `chai_worker_runtime`: INSERT, SELECT
- `chai_analytics_reader`: SELECT

## Permission Matrix

### Platform Roles

#### PLATFORM_OWNER
Full access to all platform operations:
- `platform.overview.read`
- `platform.settings.manage`
- `platform.tenant.read`
- `platform.tenant.manage`
- `platform.channel.manage`
- `platform.ai.manage`
- `platform.reliability.read`
- `platform.reliability.manage`
- `platform.audit.read`
- `platform.access.manage`
- `platform.usage.read`
- `platform.billing.manage`
- `platform.payment.read`
- `platform.shipment.read`

#### PLATFORM_SUPPORT
Limited internal access (not yet defined in permissions.ts)

### Client Roles

#### CLIENT_OWNER
Full client access (42 permissions):
- All tenant management
- All channel, inbox, conversation operations
- All contact, lead, knowledge management
- All booking, commerce, payment operations
- All shipment operations including approval
- All automation operations including pause
- Analytics read and export
- Usage and export creation

#### CLIENT_ADMIN
Admin client access (40 permissions):
- Same as CLIENT_OWNER except:
- No `payment.approve`

#### CLIENT_MANAGER
Manager client access (28 permissions):
- Tenant profile read, team read
- Channel, inbox, conversation operations
- Contact, lead, knowledge management
- Booking, commerce, payment operations
- Shipment operations including approval
- Automation read and pause
- Analytics read

#### CLIENT_AGENT
Agent client access (19 permissions):
- Tenant profile read
- Inbox, conversation operations
- Contact, lead, knowledge management
- Booking, commerce operations
- Payment read
- Shipment operations
- Proof of delivery read
- Analytics read

#### CLIENT_ANALYST
Analyst client access (15 permissions):
- Tenant profile read
- Inbox, conversation read
- Contact, lead, knowledge read
- Booking, commerce read
- Payment read
- Shipment, automation read
- Analytics read and export

#### CLIENT_VIEWER
Read-only client access (11 permissions):
- Tenant profile read
- Inbox, conversation read
- Lead, knowledge read
- Booking, commerce read
- Payment read
- Shipment, automation read
- Analytics read

## API Endpoints

### Audit Log Query API

#### GET /api/client/v1/audit-logs
Query audit logs with filters.

**Query Parameters:**
- `actorId` (optional): Filter by actor ID
- `action` (optional): Filter by action
- `resourceType` (optional): Filter by resource type
- `resourceId` (optional): Filter by resource ID
- `startDate` (optional): Filter by start date (ISO 8601)
- `endDate` (optional): Filter by end date (ISO 8601)
- `limit` (optional): Limit results (default: 100)
- `offset` (optional): Offset for pagination (default: 0)

**Response:**
```json
[
  {
    "id": "uuid",
    "tenantId": "uuid",
    "actorId": "uuid",
    "action": "lead.created",
    "resourceType": "lead",
    "resourceId": "uuid",
    "metadata": { ... },
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

#### GET /api/client/v1/audit-logs/:id
Get a specific audit log entry.

**Response:**
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "actorId": "uuid",
  "action": "lead.created",
  "resourceType": "lead",
  "resourceId": "uuid",
  "metadata": { ... },
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

## Audit Middleware

### Implementation
The audit middleware intercepts all mutation requests (POST, PUT, PATCH, DELETE) and automatically logs them to the audit trail.

**Features:**
- Extracts actor from request context
- Derives action from HTTP method and resource type
- Captures resource ID from URL path
- Logs metadata including HTTP method, path, and request body
- Captures IP address and user agent
- Non-blocking: audit logging failures don't break requests

**Action Derivation:**
- POST → `{resource}.created`
- PUT → `{resource}.updated`
- PATCH → `{resource}.updated`
- DELETE → `{resource}.deleted`

**Skipped Paths:**
- `/api/health`
- `/api/openapi`
- `/api/openapi-json`
- `/api/client/v1/audit-logs` (to avoid recursion)

## UI Components

### AuditLogList
Displays a list of audit logs with filtering capabilities.

**Features:**
- Filter by actor ID
- Filter by action
- Filter by resource type
- Filter by date range
- Paginated table view
- Responsive design

### AuditLogDetail
Displays detailed information about a specific audit log entry.

**Features:**
- Shows all audit log fields
- Formatted metadata display
- Responsive grid layout

### Audit Page
Route: `/audit`

**Features:**
- Integrates AuditLogList component
- Manages filter state
- Fetches audit logs from API (TODO)

## Files Created/Modified

### Database
- `packages/database/migrations/0012_audit_log.sql` - Audit log table schema

### Domain Layer
- `packages/domain/src/audit/audit-log.ts` - AuditLog type definitions
- `packages/domain/src/audit/audit-service.ts` - Audit log creation functions
- `packages/domain/src/index.ts` - Export audit modules

### API Module
- `apps/api/src/modules/audit/audit-log.repository.ts` - Repository for audit log queries
- `apps/api/src/modules/audit/audit.controller.ts` - API endpoints for audit logs
- `apps/api/src/modules/audit/audit.module.ts` - NestJS module
- `apps/api/src/app.module.ts` - Register AuditModule

### Middleware
- `apps/api/src/middleware/audit.middleware.ts` - Automatic audit logging for mutations

### Authorization
- `apps/api/src/guards/authorization.guard.ts` - Permission enforcement guard
- `apps/api/src/guards/require-permission.decorator.ts` - Permission decorator

### Owner Console UI
- `apps/owner-console/src/components/audit/AuditLogList.tsx` - List view component
- `apps/owner-console/src/components/audit/AuditLogDetail.tsx` - Detail view component
- `apps/owner-console/src/app/audit/page.tsx` - Audit page route

### Tests
- `apps/api/test/integration/audit.integration.test.ts` - Integration tests

### Documentation
- `docs/plans/S3-3-audit-rbac.md` - This document

## Test Coverage

### Unit Tests
- Audit log creation
- Action derivation from HTTP methods

### Integration Tests
- Audit log creation for various actions
- Audit log queries with filters
- Permission enforcement

## Issues and Blockers

### Known Issues
1. **Audit Middleware Not Registered**: The AuditMiddleware is created but not yet registered as a global interceptor in app.module.ts. This should be done carefully to avoid performance impact.

2. **Authorization Guard Not Applied**: The AuthorizationGuard is created but not yet applied to endpoints. Endpoints need to be decorated with `@RequirePermission()` to enforce permissions.

3. **UI API Integration**: The audit page UI components are created but not yet connected to the actual API endpoints.

### Recommendations
1. Register AuditMiddleware as a global interceptor with careful consideration of performance impact
2. Apply `@RequirePermission()` decorators to all endpoints based on the permission matrix
3. Connect UI components to API endpoints with proper error handling
4. Add audit log retention policy (e.g., archive logs older than 90 days)
5. Consider adding audit log aggregation for analytics

## Next Steps
1. Register AuditMiddleware in app.module.ts
2. Apply permission decorators to existing endpoints
3. Connect UI to API endpoints
4. Add audit log retention and archival
5. Implement audit log analytics and reporting
