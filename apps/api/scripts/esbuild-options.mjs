import * as esbuild from 'esbuild';

import { swcDecoratorMetadataPlugin } from './swc-decorator-metadata-plugin.mjs';

/** @type {import('esbuild').BuildOptions} */
export const buildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  sourcemap: true,
  outfile: 'dist/main.js',
  banner: {
    js: "import { createRequire as __chaiCreateRequire } from 'node:module'; const require = __chaiCreateRequire(import.meta.url);",
  },
  alias: {
    '@chai/auth/server': '../../packages/auth/src/server.ts',
    '@chai/auth': '../../packages/auth/src/index.ts',
    '@chai/contracts': '../../packages/contracts/src/index.ts',
    '@chai/domain': '../../packages/domain/src/index.ts',
    '@chai/database': '../../packages/database/src/index.ts',
    '@chai/connector-sdk': '../../packages/connector-sdk/src/index.ts',
    '@chai/connectors/mock-channel':
      '../../packages/connectors/src/connectors/mock-channel/index.ts',
    '@chai/connectors/whatsapp-meta-sandbox':
      '../../packages/connectors/src/connectors/whatsapp-meta-sandbox/index.ts',
    '@chai/connectors/mock-calendar':
      '../../packages/connectors/src/connectors/mock-calendar/index.ts',
    '@chai/connectors/mock-ai':
      '../../packages/connectors/src/connectors/mock-ai/index.ts',
    '@chai/connectors/mock-shipping':
      '../../packages/connectors/src/connectors/mock-shipping/index.ts',
    '@chai/connectors/mock-payment':
      '../../packages/connectors/src/connectors/mock-payment/index.ts',
    '@chai/connectors/midtrans':
      '../../packages/connectors/src/connectors/midtrans/index.ts',
    '@chai/connectors/webhook-verification':
      '../../packages/connectors/src/webhook-verification.ts',
    '@chai/realtime-gateway': '../../apps/realtime-gateway/src/index.ts',
  },
  external: [
    '@fastify/helmet',
    '@fastify/rate-limit',
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/platform-fastify',
    '@nestjs/swagger',
    'fastify',
    'class-transformer',
    'class-validator',
    'reflect-metadata',
    'rxjs',
    'uuid',
  ],
  plugins: [swcDecoratorMetadataPlugin()],
  logLevel: 'info',
};
