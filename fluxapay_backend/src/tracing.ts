/**
 * tracing.ts — OpenTelemetry SDK initialisation for FluxaPay backend.
 *
 * This file MUST be imported before any other application code so that
 * auto-instrumentation patches are applied before modules are required.
 * In index.ts add: `import "./tracing";` as the very first non-dotenv line.
 *
 * Environment variables
 * ─────────────────────
 * OTEL_ENABLED            – Set to "true" to activate tracing (default: false
 *                           in production to opt-in; set in staging/dev as needed).
 * OTEL_SERVICE_NAME       – Logical service name reported to the collector
 *                           (default: "fluxapay-backend").
 * OTEL_EXPORTER_OTLP_ENDPOINT
 *                         – OTLP HTTP endpoint of the collector, e.g.
 *                           http://tempo:4318  or  http://jaeger:4318
 *                           (default: http://localhost:4318).
 * OTEL_SAMPLE_RATE        – Fraction of traces to sample: 0.0–1.0
 *                           (default: 1.0 in development/staging, 0.1 in production).
 *
 * Collector setup (staging example with docker-compose):
 * ───────────────────────────────────────────────────────
 *   otel-collector:
 *     image: otel/opentelemetry-collector-contrib:latest
 *     ports:
 *       - "4318:4318"   # OTLP HTTP
 *     volumes:
 *       - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
 *     command: ["--config=/etc/otel-collector-config.yaml"]
 *
 * For Tempo (Grafana) use exporters.otlp in the collector config pointing at
 * tempo:4317.  For Jaeger set OTEL_EXPORTER_OTLP_ENDPOINT to http://jaeger:4318.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import {
  TraceIdRatioBasedSampler,
  ParentBasedSampler,
  AlwaysOnSampler,
} from "@opentelemetry/sdk-trace-base";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const OTEL_ENABLED = process.env.OTEL_ENABLED === "true";

if (!OTEL_ENABLED) {
  // Tracing is opt-in; skip initialisation when disabled.
  // This keeps cold-start overhead zero in environments that don't need it.
} else {
  const serviceName =
    process.env.OTEL_SERVICE_NAME ?? "fluxapay-backend";

  const serviceVersion =
    process.env.npm_package_version ?? "1.0.0";

  const collectorEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

  // Default sample rate: 10 % in production, 100 % elsewhere.
  const defaultRate = process.env.NODE_ENV === "production" ? 0.1 : 1.0;
  const sampleRate = parseFloat(
    process.env.OTEL_SAMPLE_RATE ?? String(defaultRate),
  );

  // ParentBased sampler respects upstream sampling decisions so traces are
  // complete end-to-end when initiated by a gateway or load balancer.
  const sampler =
    sampleRate >= 1.0
      ? new AlwaysOnSampler()
      : new ParentBasedSampler({
          root: new TraceIdRatioBasedSampler(sampleRate),
        });

  const exporter = new OTLPTraceExporter({
    url: `${collectorEndpoint}/v1/traces`,
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    }),
    traceExporter: exporter,
    sampler,
    instrumentations: [
      getNodeAutoInstrumentations({
        // HTTP instrumentation covers Express routes and outbound fetch/http calls.
        "@opentelemetry/instrumentation-http": { enabled: true },
        "@opentelemetry/instrumentation-express": { enabled: true },
        // Prisma queries are long-running I/O; instrument them too.
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Flush pending spans on process exit so the last traces are not lost.
  process.on("SIGTERM", () => sdk.shutdown());
  process.on("SIGINT", () => sdk.shutdown());

  console.log(
    `[OTEL] Tracing enabled — service="${serviceName}" collector="${collectorEndpoint}" sampleRate=${sampleRate}`,
  );
}
