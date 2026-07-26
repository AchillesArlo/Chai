import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import type { Audience } from '@chai/auth';
import {
  type AuthServerConfig,
  loginOnServer,
  readSessionStateFromCookies,
} from './server-auth';

export interface LoginPageRouteProps {
  searchParams: Promise<{ next?: string }>;
}

export type LoginServerAction = (formData: FormData) => Promise<void>;

export interface LoginConfig {
  audience: Audience;
  apiBaseUrl: string;
  defaultRedirect: string;
  title: string;
  subtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  submitLabel: string;
  /** Cookie domain (optional). */
  domain?: string;
}

function buildAuthConfig(audience: Audience, apiBaseUrl: string): AuthServerConfig {
  return {
    audience,
    apiBaseUrl,
    secure: process.env.NODE_ENV === 'production',
  };
}

/**
 * Creates a server action that attempts a login. On failure it writes a
 * short-lived `chai_login_error` cookie and redirects back to /login so the
 * page can render the message. On success it redirects to the next path or
 * the default destination.
 */
export function createLoginAction(
  config: LoginConfig,
): LoginServerAction {
  return async function loginAction(formData: FormData): Promise<void> {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    const next = String(formData.get('next') ?? '').trim();
    const jar = await cookies();
    if (!email || !password) {
      await writeLoginError(jar, 'Email and password are required.', config);
      await redirectBackToLogin(next);
    }
    try {
      await loginOnServer(buildAuthConfig(config.audience, config.apiBaseUrl), jar, email, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed.';
      await writeLoginError(jar, message, config);
      await redirectBackToLogin(next);
    }
    clearLoginError(jar);
    redirect(next || config.defaultRedirect);
  };
}

async function writeLoginError(
  jar: Awaited<ReturnType<typeof cookies>>,
  message: string,
  config: LoginConfig,
): Promise<void> {
  const options: Record<string, unknown> = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.domain ? process.env.NODE_ENV === 'production' : false,
    path: '/login',
    maxAge: 30,
  };
  if (config.domain) {
    options.domain = config.domain;
  }
  jar.set('chai_login_error', encodeURIComponent(message), options);
}

function clearLoginError(
  jar: Awaited<ReturnType<typeof cookies>>,
): void {
  jar.delete('chai_login_error');
}

async function redirectBackToLogin(
  next: string,
): Promise<never> {
  const target = next ? `/login?next=${encodeURIComponent(next)}` : '/login';
  redirect(target);
}

export async function redirectIfAuthenticated(
  config: LoginConfig,
): Promise<void> {
  const jar = await cookies();
  const state = readSessionStateFromCookies(jar);
  if (state.isAuthenticated && state.audience === config.audience) {
    redirect(config.defaultRedirect);
  }
}

export async function getNextParam(
  searchParams: { next?: string },
): Promise<string | null> {
  const next = searchParams.next;
  if (!next) {
    return null;
  }
  // ponytail: only allow same-origin paths to avoid open-redirect.
  if (next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return null;
}

