/**
 * config/tracing.ts — OpenTelemetry SDK initialisation for FluxaPay backend.
 *
 * This module MUST be imported before any other application module so that
 * auto-instrumentation patches are applied before those modules are required.
 * Import it as the very first line of src/index.ts:
 *
 *   import "./config/tracing";
 *
 * ─── Environment variables ──────────────────────────────────────────────────
 *
 * OTEL_ENABLED
 *   Set to "true" to activate distributed tracing (default: disabled).
 *   In production, opt-in explicitly; in staging/dev set to "true".
 *
 * OTEL_SERVICE_NAME
 *   Logical service name reported to the collector (default: "fluxapay-backend").
 *
 * OTEL_EXPORTER_OTLP_ENDPOINT
 *   OTLP HTTP endpoint of the trace collector, e.g.
 *   http://otel-collector:4318  or  http://jaeger:4318
 *   (default: http://localhost:4318).
 *
 * OTEL_SAMPLE_RATE
 *   Fraction of traces to sample: 0.0–1.0
 *   (default: 1.0 in development/staging, 0.1 in production).
 *
 * ─── Collector setup (docker-compose example) ───────────────────────────────
 *
 *   otel-collector:
 *     image: otel/opentelemetry-collector-contrib:latest
 *     ports:
 *       - "4318:4318"   # OTLP HTTP
 *     volumes:
 *       - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
 *     command: ["--config=/etc/otel-collector-config.yaml"]
 *
 * For Grafana Tempo point exporters.otlp at tempo:4317.
 * For Jaeger set OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import {
  TraceIdRatioBasedSampler,
  ParentBasedSampler,
  AlwaysOnSampler,
} from "@opentelemetry/sdk-trace-base";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

/** Holds the SDK instance so callers can invoke sdk.shutdown() on demand. */
let _sdk: NodeSDK | undefined;

/**
 * Returns true when tracing has been initialised (OTEL_ENABLED=true and
 * initTracing() has been called successfully).
 */
export function isTracingEnabled(): boolean {
  return _sdk !== undefined;
}

/**
 * Gracefully flush all pending spans and stop the SDK.
 *
 * Safe to call even when tracing is disabled — returns a resolved promise.
 * The shutdown.service.ts can await this during the graceful-shutdown sequence.
 */
export async function shutdownTracing(): Promise<void> {
  if (_sdk) {
    await _sdk.shutdown();
    _sdk = undefined;
  }
}

/**
 * Initialise the OpenTelemetry Node SDK.
 *
 * Called once at process startup (side-effect import in src/index.ts).
 * Returns the SDK instance, or undefined when OTEL_ENABLED is not "true".
 */
export function initTracing(): NodeSDK | undefined {
  if (process.env.OTEL_ENABLED !== "true") {
    // Tracing is opt-in. Skip all initialisation so there is zero cold-start
    // overhead in environments that don't need distributed tracing.
    return undefined;
  }

  const serviceName =
    process.env.OTEL_SERVICE_NAME ?? "fluxapay-backend";

  const serviceVersion =
    process.env.npm_package_version ?? "1.0.0";

  const collectorEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

  // Default sample rate: 10 % in production, 100 % everywhere else.
  const defaultRate = process.env.NODE_ENV === "production" ? 0.1 : 1.0;
  const sampleRate = Math.min(
    1.0,
    Math.max(0.0, parseFloat(process.env.OTEL_SAMPLE_RATE ?? String(defaultRate))),
  );

  // ParentBasedSampler respects upstream sampling decisions so traces remain
  // complete end-to-end when a gateway or load balancer is upstream.
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
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    }),
    traceExporter: exporter,
    sampler,
    instrumentations: [
      getNodeAutoInstrumentations({
        // HTTP instrumentation covers Express routes and all outbound HTTP calls
        // (node-fetch, got, axios, etc.) including Stellar Horizon/Soroban RPCs.
        "@opentelemetry/instrumentation-http": { enabled: true },
        // Express instrumentation adds per-route spans and propagates context
        // through middleware chains automatically.
        "@opentelemetry/instrumentation-express": { enabled: true },
        // Filesystem spans add noise without insight in this application.
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();
  _sdk = sdk;

  // Flush pending spans on graceful process exit so no traces are lost.
  // shutdown.service.ts also calls shutdownTracing() for ordered cleanup.
  const onSignal = (): void => {
    shutdownTracing().catch(() => {
      // Suppress errors during exit — the process is already terminating.
    });
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  console.log(
    `[OTEL] Tracing enabled — service="${serviceName}" ` +
      `collector="${collectorEndpoint}" sampleRate=${sampleRate}`,
  );

  return sdk;
}

// Side-effect: initialise tracing when this module is first imported.
initTracing();
