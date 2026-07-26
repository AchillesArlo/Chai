import { z } from 'zod';

import { UuidV7Schema } from '../ids';

export const LOGIN_EMAIL_MAX = 254;
export const LOGIN_PASSWORD_MIN = 8;
export const LOGIN_PASSWORD_MAX = 256;

export const LoginRequestSchema = z.strictObject({
  email: z.email().max(LOGIN_EMAIL_MAX),
  password: z.string().min(LOGIN_PASSWORD_MIN).max(LOGIN_PASSWORD_MAX),
});

export const RefreshRequestSchema = z.strictObject({
  refreshToken: z.string().min(1).max(4096),
});

export const AudienceSchema = z.enum([
  'owner-console',
  'client-portal',
  'widget',
  'service',
]);

export const SessionTokenSchema = z.strictObject({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  tokenType: z.literal('Bearer'),
});

export const SessionPrincipalSchema = z.strictObject({
  principalId: UuidV7Schema,
  audience: AudienceSchema,
  tenantId: UuidV7Schema.optional(),
  role: z.string().min(1).optional(),
});

export const LoginResponseSchema = SessionTokenSchema.extend({
  principal: SessionPrincipalSchema,
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type SessionToken = z.infer<typeof SessionTokenSchema>;
