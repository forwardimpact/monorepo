import crypto from "crypto";
import grpc from "@grpc/grpc-js";

/**
 * HMAC-based authenticator for service-to-service authentication
 * Uses HMAC-SHA256 to generate and verify time-limited tokens
 */
export class HmacAuth {
  #secret;
  #tokenLifetimeMs;

  /**
   * Creates a new HMAC authenticator instance
   * @param {string} secret - Shared secret key for HMAC generation (minimum 32 characters)
   * @param {number} tokenLifetimeSeconds - Token lifetime in seconds (default: 60)
   * @throws {Error} When secret is too short or invalid
   */
  constructor(secret, tokenLifetimeSeconds = 60) {
    if (!secret || typeof secret !== "string") {
      throw new Error("Secret must be a non-empty string");
    }
    if (secret.length < 32) {
      throw new Error("Secret must be at least 32 characters long");
    }
    if (tokenLifetimeSeconds <= 0) {
      throw new Error("Token lifetime must be positive");
    }

    this.#secret = secret;
    this.#tokenLifetimeMs = tokenLifetimeSeconds * 1000;
  }

  /**
   * Generates an HMAC token for the specified service
   * @param {string} serviceId - Identifier of the service requesting authentication
   * @returns {string} Base64 encoded HMAC token
   * @throws {Error} When serviceId is invalid
   */
  generateToken(serviceId) {
    if (!serviceId || typeof serviceId !== "string") {
      throw new Error("Service ID must be a non-empty string");
    }

    const timestamp = Date.now();
    const payload = `${serviceId}:${timestamp}`;
    const signature = crypto
      .createHmac("sha256", this.#secret)
      .update(payload)
      .digest("hex");

    const token = `${payload}:${signature}`;
    return Buffer.from(token).toString("base64");
  }

  /**
   * Verifies an HMAC token and extracts service information
   * @param {string} token - Base64 encoded HMAC token to verify
   * @returns {object} Verification result containing serviceId and isValid
   * @throws {Error} When token format is invalid
   */
  verifyToken(token) {
    if (!token || typeof token !== "string") {
      return {
        isValid: false,
        serviceId: null,
        error: "Token must be a non-empty string",
      };
    }

    try {
      // Decode base64 token
      const decoded = Buffer.from(token, "base64").toString("utf8");
      const parts = decoded.split(":");

      if (parts.length !== 3) {
        return {
          isValid: false,
          serviceId: null,
          error: "Invalid token format",
        };
      }

      const [serviceId, timestampStr, providedSignature] = parts;
      const timestamp = parseInt(timestampStr, 10);

      if (isNaN(timestamp)) {
        return {
          isValid: false,
          serviceId: null,
          error: "Invalid timestamp in token",
        };
      }

      // Check token expiration
      const now = Date.now();
      if (now - timestamp > this.#tokenLifetimeMs) {
        return {
          isValid: false,
          serviceId: null,
          error: "Token has expired",
        };
      }

      // Verify HMAC signature
      const payload = `${serviceId}:${timestamp}`;
      const expectedSignature = crypto
        .createHmac("sha256", this.#secret)
        .update(payload)
        .digest("hex");

      if (providedSignature !== expectedSignature) {
        return {
          isValid: false,
          serviceId: null,
          error: "Invalid token signature",
        };
      }

      return {
        isValid: true,
        serviceId,
        error: null,
      };
    } catch (error) {
      return {
        isValid: false,
        serviceId: null,
        error: `Token verification failed: ${error.message}`,
      };
    }
  }

  /**
   * Gets the configured token lifetime in seconds
   * @returns {number} Token lifetime in seconds
   */
  getTokenLifetime() {
    return this.#tokenLifetimeMs / 1000;
  }
}

/**
 * gRPC interceptor for HMAC-based service authentication
 * Handles automatic token attachment for outgoing requests and validation for incoming requests
 */
export class Interceptor {
  #authenticator;
  #serviceId;

  /**
   * Creates a new authentication interceptor
   * @param {HmacAuth} authenticator - HMAC authenticator instance
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
