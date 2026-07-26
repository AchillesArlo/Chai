// Real OpenTelemetry wiring (blueprint 12 §2, ADR-018). The previous in-repo
// tracer collected spans in a local array and exported them nowhere, so no
// service ever produced a trace.
import { diag, DiagConsoleLogger, DiagLogLevel, SpanStatusCode, trace } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

import { PiiRedactionPipeline } from '../pii-pipeline/pipeline';

export interface TelemetryConfig {
  /** Deployment environment, e.g. 'production'. Kept as a resource attribute. */
  environment: string;
  /** OTLP/HTTP collector endpoint. Without it, nothing can be exported. */
  otlpEndpoint?: string;
  /** Sampling ratio 0..1 applied to root spans. */
  samplingRatio?: number;
  serviceName: string;
  serviceVersion: string;
}

export interface TelemetryHandle {
  /** True when spans are actually being exported to a collector. */
  readonly enabled: boolean;
  /** Forces the batch processor to hand its buffer to the exporter. */
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Strips PII from span attributes before they leave the process.
 *
 * Attributes are the easiest place for a phone number or an email to leak into
 * a third-party backend, and unlike logs a span is exported by default. The
 * redaction pipeline already knows the field classes, so this reuses it rather
 * than keeping a second list of sensitive keys (12 §7, ADR-020).
 */
export class PiiRedactingSpanProcessor implements SpanProcessor {
  constructor(
    private readonly inner: SpanProcessor,
    private readonly pipeline = new PiiRedactionPipeline(),
  ) {}

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }

  onEnd(span: ReadableSpan): void {
    const { redacted } = this.pipeline.redact({ ...span.attributes });
    // ReadableSpan.attributes is intentionally read-only in the SDK types, but
    // redacting in place is the only way to stop the value reaching the
    // exporter — replacing the span object would drop its context. The pipeline
    // preserves keys, so overwriting values is enough.
    const target = span.attributes as Record<string, unknown>;
    Object.assign(target, redacted);
    this.inner.onEnd(span);
  }

  onStart(...args: Parameters<SpanProcessor['onStart']>): void {
    this.inner.onStart(...args);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }
}

/**
 * Starts the OTel Node SDK.
 *
 * When no OTLP endpoint is configured the SDK is not started at all: a silent
 * no-op exporter would look like working telemetry while emitting nothing, which
 * is exactly the failure this replaces. The caller gets `enabled: false` and can
 * decide whether that is acceptable for the environment.
 */
export function startTelemetry(
  config: TelemetryConfig,
  exporterOverride?: SpanExporter,
): TelemetryHandle {
  const endpoint = config.otlpEndpoint?.trim();
  if (!endpoint && !exporterOverride) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
    diag.warn(
      `telemetry disabled for ${config.serviceName}: no OTLP endpoint configured`,
    );
    return { enabled: false, flush: async () => {}, shutdown: async () => {} };
  }

  const exporter =
    exporterOverride ?? new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });
  const processor = new PiiRedactingSpanProcessor(new BatchSpanProcessor(exporter));

  const sdk = new NodeSDK({
    metricReader: endpoint
      ? new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        })
      : undefined,
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
      'deployment.environment.name': config.environment,
    }),
    spanProcessors: [processor],
  });

  sdk.start();
  return {
    enabled: true,
    flush: () => processor.forceFlush(),
    shutdown: () => sdk.shutdown(),
  };
}

/**
 * Runs `fn` inside a real span.
 *
 * Replaces the previous helper that wrote to an in-memory array. Context
 * propagation now comes from the OTel API, so a span started in the API is the
 * parent of the worker span it triggers.
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes: Record<string, string | number | boolean> = {},
  tracerName = 'chai',
): Promise<T> {
  const tracer = trace.getTracer(tracerName);
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'unknown error',
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}
