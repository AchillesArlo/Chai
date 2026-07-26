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
import { registerLocalIdentityHook } from './auth/local-identity';
import { loadTokenConfig } from './auth/token-config';
import { registerTokenHook } from './auth/token-hook';
import { registerCorrelationHook } from './common/correlation';
import type { ApplicationOptions } from './config';

export async function createApplication(
  options: ApplicationOptions,
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
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
