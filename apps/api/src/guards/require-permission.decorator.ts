import { SetMetadata } from '@nestjs/common';

import type { Permission } from '@chai/auth';

export const REQUIRED_PERMISSION = 'required-permission';

export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);
