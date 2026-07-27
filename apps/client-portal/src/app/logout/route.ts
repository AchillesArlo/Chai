import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { logoutOnServer } from '@chai/auth-client';

export async function POST(): Promise<NextResponse> {
  const config = {
    audience: 'client-portal' as const,
    apiBaseUrl: process.env.API_URL ?? 'http://localhost:3001',
    secure: process.env.NODE_ENV === 'production',
  };
  const jar = await cookies();
  await logoutOnServer(config, jar);
  // basePath ('/portal', see next.config.ts) does NOT auto-prefix a redirect
  // whose base URL is an absolute external origin (only next/link, next/router,
  // and in-middleware NextResponse.redirect(new URL(path, request.url)) get
  // that treatment) — so the /portal segment is added explicitly here.
  return NextResponse.redirect(new URL('/portal/login', process.env.APP_URL ?? 'http://localhost:3002'), {
    status: 303,
  });
}
