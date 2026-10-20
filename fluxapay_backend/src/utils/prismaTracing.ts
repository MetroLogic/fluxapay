/**
 * utils/prismaTracing.ts — OpenTelemetry span contextualization for Prisma.
 *
 * Wraps a PrismaClient so that every Prisma model operation (findMany,
 * create, update, delete, etc.) is wrapped in a child OTel span.  The span
 * records the model name, operation, and whether the call succeeded or failed.
 *
 * Usage:
 *
 *   import { prisma as rawPrisma } from "./config/prisma";
 *   import { withTracingPrisma } from "./utils/prismaTracing";
 *
 *   export const prisma = withTracingPrisma(rawPrisma);
 *
 * When OTEL is disabled (OTEL_ENABLED !== "true") the original client is
 * returned unchanged so there is zero runtime overhead.
 *
 * Note: @opentelemetry/auto-instrumentations-node also includes
 * @opentelemetry/instrumentation-prisma when the prisma package emits
 * OpenTelemetry traces natively (requires `previewFeatures = ["tracing"]` in
 * schema.prisma).  This utility provides manual span wrapping as a fallback
 * that works without that preview feature.
 */

import { trace, SpanStatusCode, context as otelContext } from "@opentelemetry/api";

const TRACER_NAME = "fluxapay-prisma";

/**
 * The set of Prisma model operations we want to wrap with a span.
 * These map directly to the method names on any Prisma delegate object.
 */
const PRISMA_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

type AnyRecord = Record<string, unknown>;

/**
 * Returns a Proxy around `client` that wraps each Prisma model operation in
 * an OTel child span named `prisma.<Model>.<operation>`.
 *
 * When tracing is disabled the original client is returned as-is.
 */
export function withTracingPrisma<T extends object>(client: T): T {
  // Skip instrumentation entirely when OTel is not enabled so there is
  // zero Proxy overhead in non-tracing environments.
  if (process.env.OTEL_ENABLED !== "true") {
    return client;
  }

  const tracer = trace.getTracer(TRACER_NAME);

  return new Proxy(client, {
    get(target, modelProp, receiver) {
      const modelValue = Reflect.get(target, modelProp, receiver) as unknown;

      // Only proxy plain-object model delegates (payment, merchant, etc.)
      if (
        typeof modelProp === "symbol" ||
        typeof modelValue !== "object" ||
        modelValue === null
      ) {
        return typeof modelValue === "function"
          ? (modelValue as Function).bind(target)
          : modelValue;
      }

      const modelName = String(modelProp);

      // Return a second Proxy for the model delegate
      return new Proxy(modelValue as AnyRecord, {
        get(delegate, operationProp, delegateReceiver) {
          const method = Reflect.get(
            delegate,
            operationProp,
            delegateReceiver,
          ) as unknown;

          if (
            typeof operationProp !== "string" ||
            typeof method !== "function" ||
            !PRISMA_OPERATIONS.has(operationProp)
          ) {
            return typeof method === "function"
              ? (method as Function).bind(delegate)
              : method;
          }

          const operationName = operationProp;
          const spanName = `prisma.${modelName}.${operationName}`;

          // Return a wrapper that runs the Prisma call inside an OTel span
          return async (...args: unknown[]) => {
            return tracer.startActiveSpan(
              spanName,
              {
                attributes: {
                  "db.system": "postgresql",
                  "db.operation": operationName,
                  "prisma.model": modelName,
                },
              },
              otelContext.active(),
              async (span) => {
                try {
                  const result = await (method as Function).apply(delegate, args);
                  span.setStatus({ code: SpanStatusCode.OK });
                  return result;
                } catch (err) {
                  span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: err instanceof Error ? err.message : String(err),
                  });
                  span.recordException(err instanceof Error ? err : new Error(String(err)));
                  throw err;
                } finally {
                  span.end();
                }
              },
            );
          };
        },
      });
    },
  });
}
