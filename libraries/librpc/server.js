import {
  Rpc,
  createGrpc,
  createAuth,
  createObserver,
  capitalizeFirstLetter,
} from "./base.js";

/**
 * gRPC Server class using pre-compiled service definitions
 * Takes a service instance and creates a gRPC server around it
 */
export class Server extends Rpc {
  #server;
  #service;

  /**
   * Creates a gRPC server for a service
   * @param {object} service - Service instance with business logic
   * @param {object} config - Server configuration
   * @param {object} [logger] - Optional logger instance
   * @param {import("@forwardimpact/libtelemetry").Tracer} [tracer] - Optional tracer for distributed tracing
   * @param {(serviceName: string, logger: object, tracer: object) => object} observerFn - Observer factory
   * @param {() => {grpc: object}} grpcFn - gRPC factory
   * @param {(serviceName: string) => object} authFn - Auth factory
   */
  constructor(
    service,
    config,
    logger = null,
    tracer = null,
    observerFn = createObserver,
    grpcFn = createGrpc,
    authFn = createAuth,
  ) {
    if (!service) throw new Error("service is required");

    super(config, logger, tracer, observerFn, grpcFn, authFn);
    this.#service = service;
  }

  /** Starts the gRPC server */
  async start() {
    // Configure server with keepalive for long-running streams
    // https://github.com/grpc/grpc-node/blob/master/doc/keepalive.md
    this.#server = new (this.grpc().Server)({
      "grpc.keepalive_time_ms": 30000, // Send keepalive ping every 30 seconds
      "grpc.keepalive_timeout_ms": 10000, // Wait 10 seconds for ping ack
      "grpc.keepalive_permit_without_calls": 1, // Allow keepalive without active calls
      "grpc.http2.min_time_between_pings_ms": 10000, // Minimum 10s between pings
      "grpc.http2.max_pings_without_data": 0, // Unlimited pings without data
    });

    // Get pre-compiled service definition
    const serviceName = capitalizeFirstLetter(this.config.name);
    const definition = this.getServiceDefinition(serviceName);

    // Get handlers from the service instance
    const handlers = this.#service.getHandlers();

    // Wrap handlers with auth/error handling
    const wrappedHandlers = this.#wrapHandlers(handlers, definition);

    this.#server.addService(definition, wrappedHandlers);

    const uri = `${this.config.host}:${this.config.port}`;
    await this.#bindServer(uri);

    this.#setupShutdown();
  }

  /**
   * Wraps handlers with auth and error handling
   * @param {object} handlers - Service method handlers
   * @param {object} definition - Service definition
   * @returns {object} Wrapped handlers
   */
  #wrapHandlers(handlers, definition) {
    const wrapped = {};
    for (const [method, handler] of Object.entries(handlers)) {
      const methodDef = definition[method];
      if (methodDef?.responseStream) {
        wrapped[method] = this.#wrapStreaming(method, handler);
      } else {
        wrapped[method] = this.#wrapUnary(method, handler);
      }
    }
    return wrapped;
  }

  /**
   * Wraps a streaming handler with tracing, authentication, and error handling via Observer
   * @param {string} methodName - Method name for tracing
   * @param {Function} handler - Streaming handler function
   * @returns {Function} Wrapped handler
   */
  #wrapStreaming(methodName, handler) {
    return async (call) => {
      const emitError = (code, message) =>
        call.emit("error", { code, message });

      // Validate call.request exists (for server streaming)
      if (!call?.request) {
        return emitError(
          this.grpc().status.INVALID_ARGUMENT,
          "Invalid request: call.request is missing",
        );
      }

      // Authenticate
      const validation = this.auth().validateCall(call);
      if (!validation.isValid) {
        return emitError(
          this.grpc().status.UNAUTHENTICATED,
          `Authentication failed: ${validation.error}`,
        );
      }

      // Observer handles everything: spans, events, metadata, logging
      try {
        await this.observer().observeServerStreamingCall(
          methodName,
          call,
          handler,
        );
      } catch (error) {
        emitError(this.grpc().status.INTERNAL, error?.message || String(error));
      }
    };
  }

  /**
   * Wraps a unary handler with tracing, authentication, and error handling via Observer
   * @param {string} methodName - Method name for tracing
   * @param {Function} handler - Unary handler function
   * @returns {Function} Wrapped handler
   */
  #wrapUnary(methodName, handler) {
    return async (call, callback) => {
      // Validate call.request exists
      if (!call?.request) {
        return callback({
          code: this.grpc().status.INVALID_ARGUMENT,
          message: "Invalid request: call.request is missing",
        });
      }

      // Authenticate
      const validation = this.auth().validateCall(call);
      if (!validation.isValid) {
        return callback({
          code: this.grpc().status.UNAUTHENTICATED,
          message: `Authentication failed: ${validation.error}`,
        });
      }

      // Observer handles everything: spans, events, metadata, logging
      try {
        const response = await this.observer().observeServerUnaryCall(
          methodName,
          call,
          async (call) => await handler(call),
        );
        callback(null, response);
      } catch (error) {
        callback({
          code: this.grpc().status.INTERNAL,
          message: error?.message || String(error),
        });
      }
    };
  }

  /**
   * Binds server to the specified URI
   * @param {string} uri - Server URI to bind to
   * @returns {Promise<number>} Bound port number
   */
  async #bindServer(uri) {
    return new Promise((resolve, reject) => {
      this.#server.bindAsync(
        uri,
        this.grpc().ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            this.observer().logger()?.error("Server", error);
            reject(error);
          } else {
            this.observer().logger()?.info("Server", "Listening", { uri });
            resolve(port);
          }
        },
      );
    });
  }

  /** Sets up graceful shutdown handlers */
  #setupShutdown() {
    const shutdown = async () => {
      this.observer().logger()?.info("Server", "Shutting down...");

      // Call service shutdown if it exists
      if (typeof this.#service.shutdown === "function") {
        await this.#service.shutdown();
      }

      this.#server.tryShutdown(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}
