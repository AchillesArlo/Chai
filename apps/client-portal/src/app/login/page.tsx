import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { createLoginAction, getNextParam, redirectIfAuthenticated } from '@chai/auth-client';

export const metadata: Metadata = {
  description: 'Sign in to your Chai client workspace.',
  title: 'Sign in · Chai Client Portal',
};

const CONFIG = {
  audience: 'client-portal' as const,
  apiBaseUrl: process.env.API_URL ?? 'http://127.0.0.1:3001',
  defaultRedirect: '/portal/inbox',
  title: 'Sign in to Chai',
  subtitle: 'Your customer operations workspace',
  emailLabel: 'Work email',
  emailPlaceholder: 'you@company.com',
  submitLabel: 'Sign in',
};

const login = createLoginAction(CONFIG);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await redirectIfAuthenticated(CONFIG);
  const params = await searchParams;
  const next = await getNextParam(params);

  let serverError: string | null = null;
  try {
    const jar = await cookies();
    const cookie = jar.get('chai_login_error');
    if (cookie?.value) {
      serverError = decodeURIComponent(cookie.value);
    }
  } catch {
    // cookies() may not be available in some test contexts.
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">{CONFIG.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{CONFIG.subtitle}</p>
        </header>
        <form action={login} className="flex flex-col gap-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">{CONFIG.emailLabel}</span>
            <input
              type="email"
              name="email"
              placeholder={CONFIG.emailPlaceholder}
              required
              autoComplete="email"
              autoFocus
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="current-password"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {CONFIG.submitLabel}
          </button>
        </form>
        {serverError ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {serverError}
          </p>
        ) : null}
        <footer className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <p>Owner?{' '}
            {/* basePath ('/portal', next.config.ts) only auto-prefixes
                next/link/router; a plain <a> to owner-console (nginx root,
                outside this app's basePath) must stay an absolute path. */}
            <a className="text-brand-600 hover:underline" href="/login">
              Owner console sign-in
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
