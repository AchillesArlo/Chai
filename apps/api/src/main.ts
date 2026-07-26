// Telemetry starts before the application so the SDK can instrument the
// libraries the app is about to load (12 §2).
import { startTelemetry } from '@chai/domain';

import { createApplication } from './bootstrap';

async function bootstrap(): Promise<void> {
  const environment = process.env.APP_ENV ?? 'production';
  const telemetry = startTelemetry({
    environment,
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'chai-api',
    serviceVersion: process.env.APP_VERSION ?? '0.0.0',
  });

  const app = await createApplication({ environment });
  const port = Number.parseInt(process.env.PORT ?? '3001', 10);
  // Flush buffered spans on shutdown, otherwise the last seconds of a trace —
  // usually the interesting part of an incident — never leave the process.
  app.enableShutdownHooks();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void telemetry.shutdown().finally(() => app.close());
    });
  }
  await app.listen(port, '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(`API startup failed: ${message}\n`);
  process.exitCode = 1;
});
