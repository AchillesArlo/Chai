import type { Metadata } from 'next';

import { createLoginAction, getNextParam, redirectIfAuthenticated } from '@chai/auth-client';

export const metadata: Metadata = {
  description: 'Chai platform owner console sign-in.',
  title: 'Sign in · Chai Owner Console',
};

const CONFIG = {
  audience: 'owner-console' as const,
  apiBaseUrl: process.env.API_URL ?? 'http://localhost:3001',
  defaultRedirect: '/',
  title: 'Owner Console',
  subtitle: 'Chai platform administration',
  emailLabel: 'Owner email',
  emailPlaceholder: 'owner@chai.local',
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

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 p-8 shadow-lg">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-white">{CONFIG.title}</h1>
          <p className="mt-1 text-sm text-slate-400">{CONFIG.subtitle}</p>
        </header>
        <form action={login} className="flex flex-col gap-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-200">{CONFIG.emailLabel}</span>
            <input
              type="email"
              name="email"
              placeholder={CONFIG.emailPlaceholder}
              required
              autoComplete="email"
              autoFocus
              className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-200">Password</span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="current-password"
              className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50"
          >
            {CONFIG.submitLabel}
          </button>
        </form>
        <footer className="mt-6 border-t border-slate-700 pt-4 text-xs text-slate-400">
          <p>Client user?{' '}
            <a className="text-brand-400 hover:underline" href="http://localhost:3002/login">
              Client portal sign-in
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
