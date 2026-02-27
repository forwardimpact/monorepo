import { extractAttributes } from "./attributes.js";

/**
 * Observer class that unifies logging and tracing for RPC operations
 * Coordinates span lifecycle and automatic span events
 */
export class Observer {
  #logger;
  #tracer;

  /**
   * Creates a new Observer instance
   * @param {string} serviceName - Name of the service
   * @param {object} [logger] - Optional logger instance
   * @param {object} [tracer] - Optional tracer instance
   */
  constructor(serviceName, logger = null, tracer = null) {
    if (!serviceName || typeof serviceName !== "string") {
      throw new Error("serviceName must be a non-empty string");
    }

    this.#logger = logger;
    this.#tracer = tracer;
  }

  /**
   * Returns the logger instance
   * @returns {object} Logger instance
   */
  logger() {
    return this.#logger;
  }

  /**
   * Returns the tracer instance
   * @returns {object|null} Tracer instance or null
   */
  tracer() {
    return this.#tracer;
  }

  /**
   * Observes a client RPC call (outgoing)
   * @param {string} methodName - RPC method name
   * @param {object} request - Request object
   * @param {Function} callFn - Function that executes the gRPC call with metadata
   * @returns {Promise<object>} Response object
   */
  async observeClientUnaryCall(methodName, request, callFn) {
    this.#logEvent(methodName, "Request sent", request);

    try {
      // Delegate to tracer if available
      if (this.#tracer) {
        return await this.#tracer.observeClientUnaryCall(
          methodName,
          request,
          callFn,
          this.#logger,
        );
      }

      // Fallback without tracing
      const response = await callFn();
      this.#logEvent(methodName, "Response received", response);

      return response;
    } catch (error) {
      this.#logger?.exception(methodName, error);
      throw error;
    }
  }

  /**
   * Observes a client streaming RPC call (outgoing)
   * @param {string} methodName - RPC method name
   * @param {object} request - Request object
   * @param {Function} callFn - Function that executes the gRPC call with metadata and returns a stream
   * @returns {object} The gRPC stream
   */
  observeClientStreamingCall(methodName, request, callFn) {
    this.#logEvent(methodName, "Stream started", request);

    try {
      // Delegate to tracer if available
      if (this.#tracer) {
        return this.#tracer.observeClientStreamingCall(
          methodName,
          request,
          callFn,
          this.#logger,
        );
      }

      // Fallback without tracing
      return callFn();
    } catch (error) {
      this.#logger?.exception(methodName, error);
      throw error;
    }
  }

  /**
   * Observes a server RPC handler (incoming)
   * @param {string} methodName - RPC method name
   * @param {object} call - gRPC call object with metadata and request
   * @param {Function} handlerFn - Business logic handler function
   * @returns {Promise<object>} Response object
   */
  async observeServerUnaryCall(methodName, call, handlerFn) {
    this.#logEvent(methodName, "Request received", call.request);

    try {
      // Delegate to tracer if available
      if (this.#tracer) {
        return await this.#tracer.observeServerUnaryCall(
          methodName,
          call,
          handlerFn,
          this.#logger,
        );
      }

      // Fallback without tracing
      const response = await handlerFn(call);
      this.#logEvent(methodName, "Response sent", response);

      return response;
    } catch (error) {
      this.#logger?.exception(methodName, error);
      throw error;
    }
  }

  /**
   * Observes a server streaming RPC handler (incoming)
   * @param {string} methodName - RPC method name
   * @param {object} call - gRPC call object with metadata and request
   * @param {Function} handlerFn - Business logic handler function
   * @returns {Promise<void>}
   */
  async observeServerStreamingCall(methodName, call, handlerFn) {
    this.#logEvent(methodName, "Stream received", call.request);

    try {
      // Delegate to tracer if available
      if (this.#tracer) {
        await this.#tracer.observeServerStreamingCall(
          methodName,
          call,
          handlerFn,
          this.#logger,
        );
      } else {
        // Fallback without tracing
        await handlerFn(call);
      }

      this.#logEvent(methodName, "Stream ended");
    } catch (error) {
      this.#logger?.exception(methodName, error);
      throw error;
    }
  }

  /**
   * Logs an event with attributes
   * @param {string} methodName - Method name
   * @param {string} eventName - Event name
   * @param {object} data - Event data (request or response)
   * @private
   */
  #logEvent(methodName, eventName, data) {
    if (!this.#logger || !this.#logger.enabled) return;
    const attributes = extractAttributes(data);

    // Resource ID has special meaning for tracing and therefore not part of
    // common attributes. Add it explicitly if present.
    if (data?.resource_id) attributes["resource_id"] = data.resource_id;

    this.#logger.debug(methodName, eventName, attributes);
  }
}

/**
 * Factory function to create an Observer instance
 * @param {string} serviceName - Name of the service
 * @param {object} [logger] - Optional logger instance
 * @param {object} [tracer] - Optional tracer instance
 * @returns {Observer} Configured observer instance
 */
export function createObserver(serviceName, logger = null, tracer = null) {
  return new Observer(serviceName, logger, tracer);
}
