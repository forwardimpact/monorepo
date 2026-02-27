import grpc from "@grpc/grpc-js";

import { createObserver } from "@forwardimpact/libtelemetry";

import { Interceptor, HmacAuth } from "./auth.js";
import { definitions } from "./generated/definitions/exports.js";

/**
 * Capitalize first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
export function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Default grpc factory that creates gRPC dependencies
 * @returns {object} Object containing grpc
 */
export function createGrpc() {
  return { grpc };
}

/**
 * Default auth factory that creates authentication interceptor
 * @param {string} serviceName - Name of the service for the interceptor
 * @returns {Interceptor} Configured interceptor instance
 */
export function createAuth(serviceName) {
  const secret = process.env.SERVICE_SECRET;
  if (!secret) {
    throw new Error(
      `SERVICE_SECRET environment variable is required for service ${serviceName}`,
    );
  }
  return new Interceptor(new HmacAuth(secret), serviceName);
}

export { createObserver } from "@forwardimpact/libtelemetry";

/**
 * Base class for both Server and Client with shared gRPC functionality
 */
export class Rpc {
  #grpc;
  #auth;
  #observer;

  /**
   * Creates a new Rpc instance
   * @param {object} config - Configuration object
   * @param {object} [logger] - Optional logger instance
   * @param {import("@forwardimpact/libtelemetry").Tracer} [tracer] - Optional tracer for distributed tracing
   * @param {(serviceName: string, logger: object, tracer: object) => object} observerFn - Observer factory
   * @param {() => {grpc: object}} grpcFn - gRPC factory
   * @param {(serviceName: string) => object} authFn - Auth factory
   */
  constructor(
    config,
    logger = null,
    tracer = null,
    observerFn = createObserver,
    grpcFn = createGrpc,
    authFn = createAuth,
  ) {
    if (!config) throw new Error("config is required");
    if (typeof observerFn !== "function")
      throw new Error("observerFn must be a function");
    if (typeof grpcFn !== "function")
      throw new Error("createGrpc must be a function");
    if (typeof authFn !== "function")
      throw new Error("createAuth must be a function");

    this.config = config;

    // Initialize gRPC dependencies
    const { grpc } = grpcFn();
    this.#grpc = grpc;

    // Setup authentication
    this.#auth = authFn(this.config.name);

    // Create observer with logger and tracer
    this.#observer = observerFn(this.config.name, logger, tracer);
  }

  /**
   * Returns the gRPC instance
   * @returns {object} gRPC instance
   */
  grpc = () => this.#grpc;

  /**
   * Returns the auth instance
   * @returns {object} Auth instance
   */
  auth = () => this.#auth;

  /**
   * Returns the observer instance
   * @returns {object} Observer instance
   */
  observer = () => this.#observer;

  /**
   * Returns the tracer instance
   * @returns {object} Tracer instance
   */
  tracer = () => this.#observer.tracer();

  /**
   * Get pre-compiled service definition
   * @param {string} serviceName - Service name (e.g., "Agent", "Vector")
   * @returns {object} Pre-compiled service definition
   */
  getServiceDefinition(serviceName) {
    const definition = definitions[serviceName.toLowerCase()];
    if (!definition) {
      throw new Error(
        `Service definition for ${serviceName} not found. Available: ${Object.keys(definitions).join(", ")}`,
      );
    }
    return definition;
  }
}
