export const AUDIENCES = [
  'owner-console',
  'client-portal',
  'widget',
  'service',
] as const;

export type Audience = (typeof AUDIENCES)[number];
