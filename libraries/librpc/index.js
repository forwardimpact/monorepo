import grpc from "@grpc/grpc-js";

import { createServiceConfig } from "@forwardimpact/libconfig";
import { Tracer } from "@forwardimpact/libtelemetry/tracer.js";

import { capitalizeFirstLetter } from "./base.js";
import * as exports from "./generated/services/exports.js";

export { createGrpc, createAuth, Rpc } from "./base.js";
export { Client } from "./client.js";
export { Interceptor, HmacAuth } from "./auth.js";
export { Server } from "./server.js";

// Export services and clients objects for runtime access
export const services = exports.services || {};
export const clients = exports.clients || {};

/**
 * Creates a tracer instance for a service
 * This factory should be called at startup in server.js files or when creating clients
 * @param {string} serviceName - Name of the service being traced
 * @returns {Promise<Tracer>} Configured tracer instance
 * @throws {Error} If trace service configuration cannot be loaded
 */
export async function createTracer(serviceName) {
  const traceConfig = await createServiceConfig("trace");
  const { TraceClient } = clients;
  const traceClient = new TraceClient(traceConfig);
  return new Tracer({
    serviceName,
    traceClient,
    grpcMetadata: grpc.Metadata,
  });
}

/**
 * Factory function to create a client instance with optional logging and tracing
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

  // Create config for the service
  const config = await createServiceConfig(name);

  // Create and return the client instance with logger and tracer
  return new ClientClass(config, logger, tracer);
}
