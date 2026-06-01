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
 * Default auth factory that creates an authentication interceptor. Reads
 * `SERVICE_SECRET` from the injected `runtime.proc.env` rather than
 * constructing its own process collaborator — the runtime is threaded from the
 * entry point through `Server`/`Client` (no leaf-collaborator construction in
 * src, Success Criterion 9).
 * @param {string} serviceName - Name of the service for the interceptor
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime - Injected runtime bag
 * @returns {Interceptor} Configured interceptor instance
 */
export function createAuth(serviceName, runtime) {
  if (!runtime?.proc) {
    throw new Error(
      `createAuth requires an injected runtime for service ${serviceName}`,
    );
  }
  const secret = runtime.proc.env.SERVICE_SECRET;
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
   * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime - Injected runtime bag (required), threaded to `authFn`
   * @param {object} [logger] - Optional logger instance
   * @param {import("@forwardimpact/libtelemetry").Tracer} [tracer] - Optional tracer for distributed tracing
   * @param {(serviceName: string, logger: object, tracer: object) => object} observerFn - Observer factory
   * @param {() => {grpc: object}} grpcFn - gRPC factory
   * @param {(serviceName: string, runtime: object) => object} authFn - Auth factory
   */
  constructor(
    config,
    runtime,
    logger = null,
    tracer = null,
    observerFn = createObserver,
    grpcFn = createGrpc,
    authFn = createAuth,
  ) {
    if (!config) throw new Error("config is required");
    if (!runtime) throw new Error("runtime is required");
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

    // Setup authentication (the default factory reads SERVICE_SECRET off the
    // injected runtime; a mock authFn ignores it)
    this.#auth = authFn(this.config.name, runtime);

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
