import { PassThrough } from "stream";
import { createRetry } from "@forwardimpact/libutil";

import {
  Rpc,
  createGrpc,
  createAuth,
  createObserver,
  capitalizeFirstLetter,
} from "./base.js";

/**
 * Creates a gRPC client with consistent API using pre-compiled definitions
 */
export class Client extends Rpc {
  #client;
  #retry;

  /**
   * Creates a new Client instance
   * @param {object} config - Configuration object
   * @param {object} [logger] - Optional logger instance
   * @param {import("@forwardimpact/libtelemetry").Tracer} [tracer] - Optional tracer for distributed tracing
   * @param {(serviceName: string, logger: object, tracer: object) => object} observerFn - Observer factory
   * @param {() => {grpc: object}} grpcFn - gRPC factory
   * @param {(serviceName: string) => object} authFn - Auth factory
   * @param {import("@forwardimpact/libutil").Retry} [retry] - Optional retry instance for handling transient errors
   */
  constructor(
    config,
    logger = null,
    tracer = null,
    observerFn = createObserver,
    grpcFn = createGrpc,
    authFn = createAuth,
    retry = null,
  ) {
    super(config, logger, tracer, observerFn, grpcFn, authFn);
    this.#retry = retry || createRetry({ retries: 10, delay: 1000 });
    this.#setupClient();
  }

  /**
   * Sets up the gRPC client using pre-compiled definition
   * @private
   */
  #setupClient() {
    const serviceName = capitalizeFirstLetter(this.config.name);
    const serviceDefinition = this.getServiceDefinition(serviceName);

    // In case default host is used, resort to a well-known service name
    const host =
      this.config.host === "0.0.0.0"
        ? `${this.config.name}.guide.local`
        : this.config.host;

    const uri = `${host}:${this.config.port}`;
    const options = {
      interceptors: [this.auth().createClientInterceptor()],
    };

    // Configure client with keepalive for long-running streams
    // https://github.com/grpc/grpc-node/blob/master/doc/keepalive.md
    const channelOptions = {
      "grpc.keepalive_time_ms": 30000, // Send keepalive ping every 30 seconds
      "grpc.keepalive_timeout_ms": 10000, // Wait 10 seconds for ping ack
      "grpc.keepalive_permit_without_calls": 1, // Allow keepalive without active calls
      "grpc.http2.min_time_between_pings_ms": 10000, // Minimum 10s between pings
      "grpc.http2.max_pings_without_data": 0, // Unlimited pings without data
    };
    const clientCredentials = this.grpc().credentials.createInsecure();

    // Create client using pre-compiled service definition
    const ClientConstructor = this.grpc().makeGenericClientConstructor(
      serviceDefinition,
      serviceName,
      channelOptions,
    );
    this.#client = new ClientConstructor(uri, clientCredentials, options);
  }

  /**
   * Call a gRPC method with automatic CLIENT span tracing and observability.
   * Supports unary calls.
   * @param {string} methodName - The name of the gRPC method to call
   * @param {object} request - The request object to send
   * @param {Function} [mapper] - Optional mapper function to transform response
   * @returns {Promise<object>} The response from the gRPC call
   */
  callUnary(methodName, request, mapper = null) {
    if (!this.#client[methodName]) {
      throw new Error(`Method ${methodName} not found on gRPC client`);
    }

    return this.observer()
      .observeClientUnaryCall(methodName, request, async (metadata) => {
        const m = metadata || new (this.grpc().Metadata)();
        return await this.#performUnaryCall(methodName, request, m);
      })
      .then((response) => (mapper ? mapper(response) : response));
  }

  /**
   * Call a gRPC method with automatic CLIENT span tracing and observability.
   * Supports streaming calls.
   * @param {string} methodName - The name of the gRPC method to call
   * @param {object} request - The request object to send
   * @param {Function} [mapper] - Optional mapper function to transform chunks
   * @returns {object} The stream from the gRPC call
   */
  callStream(methodName, request, mapper = null) {
    if (!this.#client[methodName]) {
      throw new Error(`Method ${methodName} not found on gRPC client`);
    }

    const stream = this.observer().observeClientStreamingCall(
      methodName,
      request,
      (metadata) => {
        const m = metadata || new (this.grpc().Metadata)();
        return this.#performStreamCall(methodName, request, m);
      },
    );

    if (mapper) {
      const mappedStream = new PassThrough({
        objectMode: true,
        transform(chunk, encoding, callback) {
          try {
            callback(null, mapper(chunk));
          } catch (err) {
            callback(err);
          }
        },
      });

      stream.on("error", (err) => mappedStream.emit("error", err));
      stream.pipe(mappedStream);
      return mappedStream;
    }

    return stream;
  }

  /**
   * Internal streaming call handler
   * @param {string} methodName - The name of the method
   * @param {object} request - Request object
   * @param {object} metadata - gRPC Metadata instance
   * @returns {object} The gRPC stream
   * @private
   */
  #performStreamCall(methodName, request, metadata) {
    const outputStream = new PassThrough({ objectMode: true });

    this.#retry
      .execute(() => {
        return new Promise((resolve, reject) => {
          const stream = this.#client[methodName](request, metadata);
          let isConnected = false;

          const onSuccess = () => {
            if (!isConnected) {
              isConnected = true;
              resolve();
            }
          };

          stream.on("metadata", (meta) => {
            outputStream.emit("metadata", meta);
          });

          stream.on("data", (chunk) => {
            onSuccess();
            outputStream.write(chunk);
          });

          stream.on("error", (err) => {
            if (!isConnected) {
              reject(err);
            } else {
              outputStream.emit("error", err);
            }
          });

          stream.on("end", () => {
            onSuccess();
            outputStream.end();
          });
        });
      })
      .catch((err) => {
        outputStream.emit("error", err);
      });

    return outputStream;
  }

  /**
   * Internal unary call handler with retry logic
   * @param {string} methodName - The name of the method
   * @param {object} request - Request object
   * @param {object} metadata - gRPC Metadata instance
   * @returns {Promise<object>} Response object
   * @private
   */
  async #performUnaryCall(methodName, request, metadata) {
    return await this.#retry.execute(() => {
      return new Promise((resolve, reject) => {
        this.#client[methodName](request, metadata, (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        });
      });
    });
  }
}
