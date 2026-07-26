import { SetMetadata } from '@nestjs/common';

export const REQUIRED_ENTITLEMENT = 'required-entitlement';

/**
 * Gates a route on a tenant capability.
 *
 * A tenant that did not buy a module must not be able to reach its surface at
 * all: the route answers `FEATURE_NOT_ENABLED` rather than acting
 * (01_PRODUCT_SCOPE §6, 06_API §5, GAP-012).
 */
export const RequireEntitlement = (capability: string) =>
  SetMetadata(REQUIRED_ENTITLEMENT, capability);
