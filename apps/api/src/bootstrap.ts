import 'reflect-metadata';

import helmet from '@fastify/helmet';
import { ValidationPipe } from '@nestjs/common';
import { registerTracingHook } from './common/tracing.hook';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { registerAuthRateLimit } from './auth/auth-rate-limit';
import { registerLocalIdentityHook } from './auth/local-identity';
import { loadTokenConfig } from './auth/token-config';
import { registerTokenHook } from './auth/token-hook';
import { registerCorrelationHook } from './common/correlation';
import type { ApplicationOptions } from './config';

/**
 * Which upstream proxies Fastify may trust for `X-Forwarded-For`, from
 * `TRUSTED_PROXY_CIDRS` (comma-separated IPs / CIDRs, e.g. `10.0.0.0/8,127.0.0.1`).
 *
 * SECURITY (auth rate-limit bypass): `request.ip` — the key for the auth rate
 * limiter (see auth-rate-limit.ts) — is derived from `X-Forwarded-For` only when
 * the immediate peer is a trusted proxy. `trustProxy: true` trusts XFF from ANY
 * peer, so an attacker rotates a fabricated XFF to mint a fresh counter per fake
 * IP and walks straight past the limiter. We therefore trust XFF ONLY from an
 * explicit allowlist of hops.
 *
 * Default when unset/empty: `false` (trust NO proxy → `request.ip` is always the
 * real socket peer). This fails CLOSED: behind an unconfigured reverse proxy
 * every request collapses onto the proxy's IP and shares one counter
 * (over-throttling, safe) rather than each forged XFF getting its own counter
 * (under-throttling, the vulnerability). Deployments behind nginx/ALB (see the
 * per-env nginx.conf under infra/) set TRUSTED_PROXY_CIDRS to that proxy's range.
 */
export function parseTrustedProxy(
  raw: string | undefined,
): boolean | string[] {
  if (!raw) {
    return false;
  }
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : false;
}

export async function createApplication(
  options: ApplicationOptions,
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: parseTrustedProxy(process.env.TRUSTED_PROXY_CIDRS),
    }),
    {
      bufferLogs: options.environment !== 'test',
      forceCloseConnections: true,
      logger: options.environment === 'test' ? false : undefined,
    },
  );

  const fastify = app.getHttpAdapter().getInstance();
  registerCorrelationHook(fastify);
  // Registered right after the correlation id so every request, including one
  // rejected by a guard, is covered by a span.
  registerTracingHook(fastify);
  registerTokenHook(fastify, {
    tokenConfig: loadTokenConfig(),
    allowTestSubject: options.environment !== 'production',
  });
  registerLocalIdentityHook(fastify, options.environment);
  await app.register(helmet, { contentSecurityPolicy: false });
  // Rate limiting is registered before Nest adds its routes (during init), so
  // the global preHandler limiter covers every route including guard rejections.
  await registerAuthRateLimit(fastify);
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks();

  const openApiConfiguration = new DocumentBuilder()
    .setTitle('Chai Platform API')
    .setDescription('Versioned Omnichannel AI Customer Operations API')
    .setVersion('1.0')
    .build();
  const documentFactory = () =>
    SwaggerModule.createDocument(app, openApiConfiguration);
  SwaggerModule.setup('api/openapi', app, documentFactory, {
    jsonDocumentUrl: 'api/openapi-json',
    ui: false,
  });

  return app;
}
