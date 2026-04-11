import grpc from "@grpc/grpc-js";

/**
 * gRPC interceptor for HMAC-based service authentication
 * Handles automatic token attachment for outgoing requests and validation for incoming requests
 */
export class Interceptor {
  #authenticator;
  #serviceId;

  /**
   * Creates a new authentication interceptor
   * @param {import('./auth.js').HmacAuth} authenticator - HMAC authenticator instance
   * @param {string} serviceId - Identifier of the current service
   * @throws {Error} When parameters are invalid
   */
  constructor(authenticator, serviceId) {
    if (!authenticator) {
      throw new Error("Authenticator is required");
    }
    if (!serviceId || typeof serviceId !== "string") {
      throw new Error("Service ID must be a non-empty string");
    }

    this.#authenticator = authenticator;
    this.#serviceId = serviceId;
  }

  /**
   * Creates a client interceptor that adds authentication tokens to outgoing requests
   * @returns {Function} gRPC client interceptor function
   */
  createClientInterceptor() {
    return (options, nextCall) => {
      return new grpc.InterceptingCall(nextCall(options), {
        start: (metadata, listener, next) => {
          // Generate and add auth token to metadata
          try {
            const token = this.#authenticator.generateToken(this.#serviceId);
            metadata.set("authorization", `Bearer ${token}`);
          } catch (error) {
            console.error("Failed to generate auth token:", error);
          }
          next(metadata, listener);
        },
      });
    };
  }

  /**
   * Creates a server interceptor that validates authentication tokens from incoming requests
   * @returns {Function} gRPC server interceptor function
   */
  createServerInterceptor() {
    return (call, metadata) => {
      // Extract and verify auth token from metadata
      const authHeader = metadata.get("authorization")[0];

      if (!authHeader) {
        throw {
          code: grpc.status.UNAUTHENTICATED,
          message: "Missing authentication token",
        };
      }

      // Extract token from "Bearer <token>" format
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
      if (!tokenMatch) {
        throw {
          code: grpc.status.UNAUTHENTICATED,
          message: "Invalid authentication header format",
        };
      }

      const token = tokenMatch[1];
      const verification = this.#authenticator.verifyToken(token);

      if (!verification.isValid) {
        throw {
          code: grpc.status.UNAUTHENTICATED,
          message: `Authentication failed: ${verification.error}`,
        };
      }

      // Add service ID to call context for potential use by handlers
      call.serviceId = verification.serviceId;
    };
  }

  /**
   * Validates an incoming gRPC call's authentication
   * This is a helper method for manual authentication validation
   * @param {object} call - gRPC call object
   * @returns {object} Verification result with isValid, serviceId, and error properties
   */
  validateCall(call) {
    try {
      const metadata = call.metadata;
      const authHeaders = metadata.get("authorization");

      if (!authHeaders || authHeaders.length === 0) {
        return {
          isValid: false,
          serviceId: null,
          error: "Missing authentication token",
        };
      }

      const authHeader = authHeaders[0];
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);

      if (!tokenMatch) {
        return {
          isValid: false,
          serviceId: null,
          error: "Invalid authentication header format",
        };
      }

      const token = tokenMatch[1];
      return this.#authenticator.verifyToken(token);
    } catch (error) {
      return {
        isValid: false,
        serviceId: null,
        error: `Authentication validation failed: ${error.message}`,
      };
    }
  }
}
