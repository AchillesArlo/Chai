import { SetMetadata } from '@nestjs/common';

import type { Audience } from '@chai/auth';

export const REQUIRED_AUDIENCE = 'required-audience';

export const RequireAudience = (audience: Audience) =>
  SetMetadata(REQUIRED_AUDIENCE, audience);
