/**
 * gRPC Health Check protocol (grpc.health.v1.Health/Check)
 *
 * Manual service definition — no .proto file or proto-loader needed.
 * Messages use raw protobuf wire encoding (trivial: one string field,
 * one enum/varint field).
 */

/** Serving status enum matching grpc.health.v1 */
export const ServingStatus = {
  UNKNOWN: 0,
  SERVING: 1,
  NOT_SERVING: 2,
  SERVICE_UNKNOWN: 3,
};

/**
 * Serialize a HealthCheckRequest to bytes.
 * Proto: message HealthCheckRequest { string service = 1; }
 */
function serializeRequest(value) {
  const service = value?.service || "";
  if (service.length === 0) return Buffer.alloc(0);
  const encoded = Buffer.from(service, "utf8");
  // field 1, wire type 2 (length-delimited): tag = 0x0a
  const header = Buffer.alloc(2);
  header[0] = 0x0a;
  header[1] = encoded.length; // works for lengths < 128
  return Buffer.concat([header, encoded]);
}

/**
 * Deserialize bytes to a HealthCheckRequest.
 */
function deserializeRequest(buffer) {
  if (!buffer || buffer.length === 0) return { service: "" };
  if (buffer[0] === 0x0a) {
    const len = buffer[1];
    return { service: buffer.subarray(2, 2 + len).toString("utf8") };
  }
  return { service: "" };
}

/**
 * Serialize a HealthCheckResponse to bytes.
 * Proto: message HealthCheckResponse { ServingStatus status = 1; }
 */
function serializeResponse(value) {
  const status = value?.status ?? 0;
  if (status === 0) return Buffer.alloc(0);
  // field 1, wire type 0 (varint): tag = 0x08
  return Buffer.from([0x08, status]);
}

/**
 * Deserialize bytes to a HealthCheckResponse.
 */
function deserializeResponse(buffer) {
  if (!buffer || buffer.length === 0) return { status: 0 };
  if (buffer[0] === 0x08) return { status: buffer[1] };
  return { status: 0 };
}

/** Service definition compatible with grpc.Server.addService */
export const healthDefinition = {
  Check: {
    path: "/grpc.health.v1.Health/Check",
    requestStream: false,
    responseStream: false,
    requestSerialize: serializeRequest,
    requestDeserialize: deserializeRequest,
    responseSerialize: serializeResponse,
    responseDeserialize: deserializeResponse,
  },
};

/**
 * Creates health check handlers for the given service name.
 * @param {string} serviceName - The application service name (e.g., "Graph")
 * @returns {object} Handler map for the Health service definition
 */
export function createHealthHandlers(serviceName) {
  return {
    Check: (_call, callback) => {
      const requestedService = _call.request?.service || "";

      if (requestedService === "" || requestedService === serviceName) {
        return callback(null, { status: ServingStatus.SERVING });
      }
      return callback(null, { status: ServingStatus.SERVICE_UNKNOWN });
    },
  };
}
