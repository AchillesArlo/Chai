import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

import {
  LOGIN_EMAIL_MAX,
  LOGIN_PASSWORD_MAX,
  LOGIN_PASSWORD_MIN,
} from '@chai/contracts';

/**
 * Login body validated by the global ValidationPipe.
 * The controller re-validates with the zod schema so the auth package and
 * the HTTP surface share one source of truth.
 */
export class LoginBodyDto {
  @IsEmail()
  @MaxLength(LOGIN_EMAIL_MAX)
  email!: string;

  @IsString()
  @Length(LOGIN_PASSWORD_MIN, LOGIN_PASSWORD_MAX)
  password!: string;
}

export class RefreshBodyDto {
  @IsString()
  @MaxLength(4096)
  refreshToken!: string;
}
