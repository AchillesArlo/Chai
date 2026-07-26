import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { SESSION_COOKIE_NAMES } from '@chai/auth';

/**
 * Server-side proxy: forwards client-side fetch calls to the API service,
 * attaching the Bearer access token from the HttpOnly session cookie.
 * Client code never sees the raw token (Blueprint §10).
 */
async function handler(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  const target = `${process.env.API_URL ?? 'http://localhost:3001'}/api/${path.join('/')}`;
  const jar = await cookies();
  const accessToken = jar.get(SESSION_COOKIE_NAMES.accessToken)?.value;
  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('content-length');
  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }
  const url = new URL(target);
  const search = new URL(req.url).search;
  if (search) {
    url.search = search;
  }
  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
    redirect: 'manual',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    init.duplex = 'half';
  }
  const upstream = await fetch(url, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export {
  handler as DELETE,
  handler as GET,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
