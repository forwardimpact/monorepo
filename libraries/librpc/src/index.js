import grpc from "@grpc/grpc-js";

import { createServiceConfig } from "@forwardimpact/libconfig";
import { Tracer } from "@forwardimpact/libtelemetry/tracer.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { capitalizeFirstLetter } from "./base.js";
import * as exports from "./generated/services/exports.js";

export { createGrpc, createAuth, Rpc } from "./base.js";
export { Client } from "./client.js";
export { Interceptor, HmacAuth } from "./auth.js";
export { Server } from "./server.js";
export {
  healthDefinition,
  createHealthHandlers,
  ServingStatus,
} from "./health.js";

// Export services and clients objects for runtime access
export const services = exports.services || {};
export const clients = exports.clients || {};

/**
 * Creates a tracer instance for a service
 * Call this factory at startup in server.js files or when you create clients
 * @param {string} serviceName - Name of the service to trace
 * @returns {Promise<Tracer>} Configured tracer instance
 * @throws {Error} If the factory cannot load the span service configuration
 */
export async function createTracer(serviceName) {
  const spanConfig = await createServiceConfig("span");
  const { SpanClient } = clients;
  // createTracer is a composition-root factory. It builds the production
  // runtime as its DI root. It threads the runtime into the SpanClient, so the
  // client's auth reads SERVICE_SECRET off the bag. It also threads the runtime
  // clock into the Tracer, and so into every Span.
  const runtime = createDefaultRuntime();
  const spanClient = new SpanClient(spanConfig, runtime);
  return new Tracer({
    serviceName,
    spanClient,
    grpcMetadata: grpc.Metadata,
    clock: runtime.clock,
  });
}

/**
 * Factory function to create a client instance with an optional logger and tracer
 * @param {string} name - Service name (e.g., "memory", "llm", "tool")
 * @param {object} [logger] - Optional logger instance
 * @param {import("@forwardimpact/libtelemetry").Tracer} [tracer] - Optional tracer instance for distributed tracing
 * @returns {Promise<object>} Initialized client instance
 */
export async function createClient(name, logger = null, tracer = null) {
  // Build the client class name (e.g., "memory" -> "MemoryClient")
  const className = capitalizeFirstLetter(name) + "Client";

  // Get the client class from exports
  const ClientClass = clients[className];
  if (!ClientClass) {
    throw new Error(
      `Client ${className} not found. Available clients: ${Object.keys(clients).join(", ")}`,
    );
  }

  // Create the config for the service
  const config = await createServiceConfig(name);

  // createClient is a composition-root factory. Build the production runtime
  // here and thread it so the client's auth reads SERVICE_SECRET off the bag.
  const runtime = createDefaultRuntime();

  // Create and return the client instance (runtime is the required 2nd arg)
  return new ClientClass(config, runtime, logger, tracer);
}
