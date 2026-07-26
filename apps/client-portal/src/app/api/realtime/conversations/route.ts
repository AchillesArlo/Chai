import { NextResponse, type NextRequest } from 'next/server';

import {
  SESSION_COOKIE_NAMES,
  verifyAccessToken,
  type TokenConfig,
} from '@chai/auth';
import { realtimeBus, type ConversationEvent } from '@chai/realtime-gateway';

const DEFAULT_ISSUER = 'chai-platform';

function tokenConfig(): TokenConfig {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret || secret.trim().length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'AUTH_TOKEN_SECRET must be set to at least 32 characters in production',
      );
    }
    // ponytail: dev fallback mirrors apps/api/src/auth/token-config.ts.
    return {
      clockSkewSeconds: 5,
      issuer: process.env.AUTH_TOKEN_ISSUER ?? DEFAULT_ISSUER,
      secret: 'dev-secret-please-rotate-auth_token_secret-0123456789abcdef',
    };
  }
  return {
    clockSkewSeconds: 5,
    issuer: process.env.AUTH_TOKEN_ISSUER ?? DEFAULT_ISSUER,
    secret,
  };
}

/**
 * Resolves the tenant from the HttpOnly session cookie.
 *
 * The tenant is never taken from a client-supplied header or query parameter:
 * an EventSource caller must not be able to name the tenant it wants to read
 * (blueprint 10_SECURITY §6, ADR-003). Membership must also be active, so a
 * revoked member loses the stream on the next connect.
 */
async function tenantFromSession(request: NextRequest): Promise<string | null> {
  const accessToken = request.cookies.get(
    SESSION_COOKIE_NAMES.accessToken,
  )?.value;
  if (!accessToken) {
    return null;
  }
  const verified = await verifyAccessToken(accessToken, tokenConfig());
  if (!verified.ok || !verified.claims) {
    return null;
  }
  const claims = verified.claims;
  if (claims.aud !== 'client-portal') {
    return null;
  }
  if (claims.principalStatus !== 'ACTIVE') {
    return null;
  }
  if (claims.membershipStatus !== 'ACTIVE' || !claims.tenantId) {
    return null;
  }
  return claims.tenantId;
}

const SSE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no', // ponytail: disable nginx buffering if present
};

function encode(event: ConversationEvent): Uint8Array {
  const body = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
  return new TextEncoder().encode(body);
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse | Response> {
  const tenantId = await tenantFromSession(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const unsubscribe = realtimeBus.subscribe(tenantId, (event) => {
        try {
          controller.enqueue(encode(event));
        } catch {
          // ponytail: controller may be closed after abort; ignore
        }
      });

      request.signal.addEventListener('abort', () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export const dynamic = 'force-dynamic'; // ponytail: SSE must not be cached/static
