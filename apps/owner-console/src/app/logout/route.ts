import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { logoutOnServer } from '@chai/auth-client';

export async function POST(): Promise<NextResponse> {
  const config = {
    audience: 'owner-console' as const,
    apiBaseUrl: process.env.API_URL ?? 'http://localhost:3001',
    secure: process.env.NODE_ENV === 'production',
  };
  const jar = await cookies();
  await logoutOnServer(config, jar);
  return NextResponse.redirect(new URL('/login', process.env.APP_URL ?? 'http://localhost:3000'), {
    status: 303,
  });
}
