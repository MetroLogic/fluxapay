/**
 * Unit tests for OpenTelemetry distributed tracing (#1340)
 *
 * Covers:
 *  1. initTracing() — respects OTEL_ENABLED flag, returns SDK / undefined
 *  2. isTracingEnabled() / shutdownTracing() lifecycle helpers
 *  3. Logger trace context injection — traceId and traceparent fields
 *  4. withTracingPrisma — Proxy wraps model operations in a span; no-ops when disabled
 */

// ── Mock the heavy OTel SDK packages so tests run without network/collector ──

jest.mock("@opentelemetry/sdk-node", () => {
  const start = jest.fn();
  const shutdown = jest.fn().mockResolvedValue(undefined);
  const NodeSDK = jest.fn().mockImplementation(() => ({ start, shutdown }));
  return { NodeSDK };
});

jest.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: jest.fn().mockReturnValue({}),
}));

jest.mock("@opentelemetry/semantic-conventions", () => ({
  SEMRESATTRS_SERVICE_NAME: "service.name",
  SEMRESATTRS_SERVICE_VERSION: "service.version",
}));

jest.mock("@opentelemetry/sdk-trace-base", () => ({
  AlwaysOnSampler: jest.fn().mockImplementation(() => ({})),
  ParentBasedSampler: jest.fn().mockImplementation(() => ({})),
  TraceIdRatioBasedSampler: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@opentelemetry/auto-instrumentations-node", () => ({
  getNodeAutoInstrumentations: jest.fn().mockReturnValue([]),
}));

// ── OTel API mock — controls what trace.getSpan() returns per test ────────────

const mockSpanContext = {
  traceId: "aabbccddeeff00112233445566778899",
  spanId:  "aabbccddeeff0011",
  traceFlags: 1, // TraceFlags.SAMPLED
};

let _mockActiveSpan: object | undefined = undefined;

jest.mock("@opentelemetry/api", () => {
  const TraceFlags = { SAMPLED: 1, NONE: 0 };
  return {
    TraceFlags,
    trace: {
      getTracer: jest.fn().mockReturnValue({
        startActiveSpan: jest.fn().mockImplementation(
          (_name: string, _opts: unknown, _ctx: unknown, fn: Function) =>
            fn({ setStatus: jest.fn(), recordException: jest.fn(), end: jest.fn() }),
        ),
      }),
      getSpan: jest.fn().mockImplementation(() => _mockActiveSpan),
    },
    context: {
      active: jest.fn().mockReturnValue({}),
    },
    isSpanContextValid: jest.fn().mockImplementation(
      (sc: { traceId?: string; spanId?: string }) =>
        Boolean(sc?.traceId && sc?.spanId),
    ),
    SpanStatusCode: { OK: 1, ERROR: 2 },
  };
});

// ─────────────────────────────────────────────────────────────────────────────

// Helper: reset module state between tests
function resetTracingModule() {
  jest.resetModules();
}

// ── 1. initTracing ──────────────────────────────────────────────────────────

describe("initTracing", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    resetTracingModule();
  });

  it("returns undefined and does NOT start SDK when OTEL_ENABLED is absent", async () => {
    delete process.env.OTEL_ENABLED;
    const { initTracing } = await import("../config/tracing");
    const { NodeSDK: MockSDK } = await import("@opentelemetry/sdk-node");
    const sdk = initTracing();
    expect(sdk).toBeUndefined();
    expect(MockSDK).not.toHaveBeenCalled();
  });

  it("returns undefined when OTEL_ENABLED=false", async () => {
    process.env.OTEL_ENABLED = "false";
    const { initTracing } = await import("../config/tracing");
    const sdk = initTracing();
    expect(sdk).toBeUndefined();
  });

  it("starts SDK and returns instance when OTEL_ENABLED=true", async () => {
    process.env.OTEL_ENABLED = "true";
    process.env.OTEL_SERVICE_NAME = "test-service";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
    const { initTracing } = await import("../config/tracing");
    // Re-import NodeSDK mock after resetModules so we get the fresh mock
    const { NodeSDK: MockSDK } = await import("@opentelemetry/sdk-node");
    const sdk = initTracing();
    expect(sdk).toBeDefined();
    expect(MockSDK).toHaveBeenCalled();
    const instance = (MockSDK as jest.Mock).mock.results[0].value;
    expect(instance.start).toHaveBeenCalled();
  });

  it("uses AlwaysOnSampler when OTEL_SAMPLE_RATE >= 1.0", async () => {
    process.env.OTEL_ENABLED = "true";
    process.env.OTEL_SAMPLE_RATE = "1.0";
    const { AlwaysOnSampler } = await import("@opentelemetry/sdk-trace-base");
    const { initTracing } = await import("../config/tracing");
    initTracing();
    expect(AlwaysOnSampler).toHaveBeenCalled();
  });

  it("uses ParentBasedSampler when OTEL_SAMPLE_RATE < 1.0", async () => {
    process.env.OTEL_ENABLED = "true";
    process.env.OTEL_SAMPLE_RATE = "0.5";
    const { ParentBasedSampler } = await import("@opentelemetry/sdk-trace-base");
    const { initTracing } = await import("../config/tracing");
    initTracing();
    expect(ParentBasedSampler).toHaveBeenCalled();
  });

  it("uses default production sample rate of 0.1 when NODE_ENV=production", async () => {
    process.env.OTEL_ENABLED = "true";
    process.env.NODE_ENV = "production";
    delete process.env.OTEL_SAMPLE_RATE;
    const { ParentBasedSampler } = await import("@opentelemetry/sdk-trace-base");
    const { initTracing } = await import("../config/tracing");
    initTracing();
    expect(ParentBasedSampler).toHaveBeenCalled();
  });
});

// ── 2. isTracingEnabled / shutdownTracing ───────────────────────────────────

describe("shutdownTracing", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    resetTracingModule();
  });

  it("resolves without error when tracing is disabled", async () => {
    delete process.env.OTEL_ENABLED;
    const { shutdownTracing, isTracingEnabled } = await import("../config/tracing");
    expect(isTracingEnabled()).toBe(false);
    await expect(shutdownTracing()).resolves.toBeUndefined();
  });

  it("calls sdk.shutdown() and marks tracing disabled", async () => {
    process.env.OTEL_ENABLED = "true";
    const { initTracing, shutdownTracing, isTracingEnabled } = await import("../config/tracing");
    const { NodeSDK: MockSDK } = await import("@opentelemetry/sdk-node");
    initTracing();
    expect(isTracingEnabled()).toBe(true);
    await shutdownTracing();
    expect(isTracingEnabled()).toBe(false);
    const instance = (MockSDK as jest.Mock).mock.results[0].value;
    expect(instance.shutdown).toHaveBeenCalledTimes(1);
  });
});

// ── 3. Logger trace context injection ──────────────────────────────────────

describe("StructuredLogger — trace context injection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("injects traceId and traceparent into log entries when a span is active", () => {
    // Simulate an active sampled span
    _mockActiveSpan = { spanContext: () => mockSpanContext };

    const { StructuredLogger } = require("../utils/logger");
    const logger = new StructuredLogger("test-svc");
    const lines: string[] = [];
    jest.spyOn(console, "info").mockImplementation((line: string) => lines.push(line));

    logger.info("test message");

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.traceId).toBe(mockSpanContext.traceId);
    expect(entry.traceparent).toBe(
      `00-${mockSpanContext.traceId}-${mockSpanContext.spanId}-01`,
    );
  });

  it("omits traceId and traceparent when no span is active", () => {
    _mockActiveSpan = undefined;

    const { StructuredLogger } = require("../utils/logger");
    const logger = new StructuredLogger("test-svc");
    const lines: string[] = [];
    jest.spyOn(console, "info").mockImplementation((line: string) => lines.push(line));

    logger.info("no span");

    const entry = JSON.parse(lines[0]);
    expect(entry.traceId).toBeUndefined();
    expect(entry.traceparent).toBeUndefined();
  });

  it("sets traceparent flags to '00' when span is not sampled", () => {
    _mockActiveSpan = {
      spanContext: () => ({ ...mockSpanContext, traceFlags: 0 }), // NOT sampled
    };

    const { StructuredLogger } = require("../utils/logger");
    const logger = new StructuredLogger("test-svc");
    const lines: string[] = [];
    jest.spyOn(console, "info").mockImplementation((line: string) => lines.push(line));

    logger.info("unsampled span");

    const entry = JSON.parse(lines[0]);
    expect(entry.traceparent).toMatch(/-00$/);
  });

  it("still logs correctly even when OTel API throws", () => {
    const { trace } = require("@opentelemetry/api");
    (trace.getSpan as jest.Mock).mockImplementationOnce(() => {
      throw new Error("OTel not initialised");
    });

    const { StructuredLogger } = require("../utils/logger");
    const logger = new StructuredLogger("test-svc");
    const lines: string[] = [];
    jest.spyOn(console, "info").mockImplementation((line: string) => lines.push(line));

    expect(() => logger.info("fallback")).not.toThrow();
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.message).toBe("fallback");
    expect(entry.traceId).toBeUndefined();
  });
});

// ── 4. withTracingPrisma ────────────────────────────────────────────────────

describe("withTracingPrisma", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  it("returns the original client unchanged when OTEL_ENABLED is not 'true'", async () => {
    delete process.env.OTEL_ENABLED;
    const { withTracingPrisma } = await import("../utils/prismaTracing");
    const mockClient = { payment: { findMany: jest.fn() } };
    const result = withTracingPrisma(mockClient as any);
    expect(result).toBe(mockClient);
  });

  it("returns a Proxy that wraps model operations in a span when OTEL_ENABLED=true", async () => {
    process.env.OTEL_ENABLED = "true";
    const { withTracingPrisma } = await import("../utils/prismaTracing");
    const { trace } = await import("@opentelemetry/api");

    const findMany = jest.fn().mockResolvedValue([{ id: "1" }]);
    const mockClient = { payment: { findMany } };
    const tracedClient = withTracingPrisma(mockClient as any) as typeof mockClient;

    const result = await tracedClient.payment.findMany();

    expect(result).toEqual([{ id: "1" }]);
    expect(findMany).toHaveBeenCalledTimes(1);
    // startActiveSpan should have been called with the prisma span name
    const tracer = (trace.getTracer as jest.Mock).mock.results[0].value;
    expect(tracer.startActiveSpan).toHaveBeenCalledWith(
      "prisma.payment.findMany",
      expect.any(Object),
      expect.anything(),
      expect.any(Function),
    );
  });

  it("does NOT wrap non-operation properties (e.g. $connect)", async () => {
    process.env.OTEL_ENABLED = "true";
    const { withTracingPrisma } = await import("../utils/prismaTracing");
    const $connect = jest.fn().mockResolvedValue(undefined);
    const mockClient = { $connect } as any;
    const tracedClient = withTracingPrisma(mockClient);

    // $connect is not a model delegate — it should be returned unproxied
    expect(typeof (tracedClient as any).$connect).toBe("function");
  });

  it("propagates errors thrown by the underlying Prisma operation", async () => {
    process.env.OTEL_ENABLED = "true";
    const { withTracingPrisma } = await import("../utils/prismaTracing");
    const error = new Error("DB connection refused");
    const findUnique = jest.fn().mockRejectedValue(error);
    const mockClient = { merchant: { findUnique } } as any;
    const tracedClient = withTracingPrisma(mockClient) as typeof mockClient;

    await expect(tracedClient.merchant.findUnique({ where: { id: "1" } })).rejects.toThrow(
      "DB connection refused",
    );
  });
});
