import type { Audience } from './audiences';
import type { Principal } from './roles';

export interface LocalIdentityRecord {
  principal: Principal;
  subject: string;
}

export interface LocalIdentityAdapter {
  authenticate(subject: string, audience: Audience): Promise<Principal>;
}

export function createLocalIdentityAdapter(configuration: {
  environment: string;
  principals: readonly LocalIdentityRecord[];
}): LocalIdentityAdapter {
  if (!['local', 'test'].includes(configuration.environment)) {
    throw new Error('Local identity adapter is restricted to local or test');
  }

  const principals = new Map(
    configuration.principals.map(({ principal, subject }) => [
      subject,
      principal,
    ]),
  );

  return {
    async authenticate(subject, audience) {
      const principal = principals.get(subject);
      if (!principal) {
        throw new Error('Synthetic identity is not configured');
      }
      if (principal.audience !== audience) {
        throw new Error('Synthetic identity audience does not match');
      }
      return principal;
    },
  };
}
