# Part 01 -- librpc Health Endpoint

## Goal

Add `grpc.health.v1.Health/Check` to the librpc `Server` class so every gRPC
service automatically responds to standard health probes without per-service
code or codegen changes.

## Files

| Action | File |
|--------|------|
| Create | `libraries/librpc/health.js` |
| Modify | `libraries/librpc/server.js` |
| Modify | `libraries/librpc/index.js` |
| Create | `libraries/librpc/test/health.test.js` |

## Step 1: Create `libraries/librpc/health.js`

This module exports two things:

1. `healthDefinition` -- a `grpc.ServiceDefinition`-compatible object for
   `grpc.health.v1.Health/Check`.
2. `createHealthHandlers(serviceName)` -- returns the handler map for the health
   service.

### Health service definition

The definition follows the exact same shape as the generated definitions in
`libraries/librpc/generated/definitions/*.js`. Each method entry has `path`,
`requestStream`, `responseStream`, `requestSerialize`, `requestDeserialize`,
`responseSerialize`, `responseDeserialize`.

The standard health proto messages are:

```protobuf
message HealthCheckRequest { string service = 1; }
message HealthCheckResponse {
  enum ServingStatus { UNKNOWN=0; SERVING=1; NOT_SERVING=2; SERVICE_UNKNOWN=3; }
  ServingStatus status = 1;
}
```

Wire encoding:

- **HealthCheckRequest serialize:** encode `service` as field 1, wire type 2
  (length-delimited). If service is empty string, encode as empty buffer.
- **HealthCheckRequest deserialize:** decode field 1 as string, default to `""`.
- **HealthCheckResponse serialize:** encode `status` as field 1, wire type 0
  (varint). If status is 0, encode as empty buffer (proto3 default omission).
- **HealthCheckResponse deserialize:** decode field 1 as varint, default to 0.

Concrete implementation:

```js
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
  // Single-byte varint length — supports service names up to 127 bytes.
  // All service names in this codebase are short (e.g., "Graph", "Agent").
  // If a name exceeds 127 bytes the encoding would be wrong, but this
  // cannot happen with our service naming conventions.
  header[1] = encoded.length;
  return Buffer.concat([header, encoded]);
}

/**
 * Deserialize bytes to a HealthCheckRequest.
 */
function deserializeRequest(buffer) {
  if (!buffer || buffer.length === 0) return { service: "" };
  // Skip tag byte (0x0a) and length byte, read the rest as utf8
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
```

The service definition:

```js
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
```

### Health handlers factory

```js
/** Serving status enum matching grpc.health.v1 */
export const ServingStatus = {
  UNKNOWN: 0,
  SERVING: 1,
  NOT_SERVING: 2,
  SERVICE_UNKNOWN: 3,
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
```

Note: the handler receives a raw `(call, callback)` pair -- no auth wrapping, no
observer. This is intentional: health checks should be as lightweight as
possible.

## Step 2: Modify `libraries/librpc/server.js`

In the `start()` method, after the application service is added and before
`#bindServer`, register the health service:

```js
// Current code in start():
this.#server.addService(definition, wrappedHandlers);

// Add after the line above:
const { healthDefinition, createHealthHandlers } = await import("./health.js");
const serviceName = capitalizeFirstLetter(this.config.name);
this.#server.addService(healthDefinition, createHealthHandlers(serviceName));
```

Wait -- `serviceName` is already computed earlier in the method. Reuse it.
The import can be a static import at the top of the file since health.js is
always needed.

**Before (top of server.js):**
```js
import {
  Rpc,
  createGrpc,
  createAuth,
  createObserver,
  capitalizeFirstLetter,
} from "./base.js";
```

**After:**
```js
import {
  Rpc,
  createGrpc,
  createAuth,
  createObserver,
  capitalizeFirstLetter,
} from "./base.js";
import { healthDefinition, createHealthHandlers } from "./health.js";
```

**Before (in `start()`):**
```js
    this.#server.addService(definition, wrappedHandlers);

    const uri = `${this.config.host}:${this.config.port}`;
```

**After:**
```js
    this.#server.addService(definition, wrappedHandlers);

    // Register standard gRPC health check (no auth, no observer wrapping)
    this.#server.addService(
      healthDefinition,
      createHealthHandlers(serviceName),
    );

    const uri = `${this.config.host}:${this.config.port}`;
```

## Step 3: Export from `libraries/librpc/index.js`

Add the health definition export so the status command (Part 02) can use it to
build a lightweight health client:

**Before:**
```js
export { createGrpc, createAuth, Rpc } from "./base.js";
export { Client } from "./client.js";
export { Interceptor, HmacAuth } from "./auth.js";
export { Server } from "./server.js";
```

**After:**
```js
export { createGrpc, createAuth, Rpc } from "./base.js";
export { Client } from "./client.js";
export { Interceptor, HmacAuth } from "./auth.js";
export { Server } from "./server.js";
export {
  healthDefinition,
  createHealthHandlers,
  ServingStatus,
} from "./health.js";
```

## Step 4: Create `libraries/librpc/test/health.test.js`

Tests follow the existing pattern in `libraries/librpc/test/server.test.js`:
import from `../index.js`, use libharness mocks.

### Test cases

1. **Health definition shape.** Verify `healthDefinition.Check` has the required
   fields: `path`, `requestStream`, `responseStream`, `requestSerialize`,
   `requestDeserialize`, `responseSerialize`, `responseDeserialize`.

2. **Request serialization round-trip.** Serialize `{ service: "Graph" }`, then
   deserialize, assert `service === "Graph"`. Also test empty string.

3. **Response serialization round-trip.** Serialize `{ status: 1 }` (SERVING),
   deserialize, assert `status === 1`. Also test status 0 (UNKNOWN -- proto3
   default, encoded as empty buffer) and status 3 (SERVICE_UNKNOWN).

4. **Handler: empty service name returns SERVING.** Call the Check handler with
   `{ request: { service: "" } }`, assert response `status === 1`.

5. **Handler: matching service name returns SERVING.** Call with
   `{ request: { service: "Graph" } }`, handlers created with `"Graph"`, assert
   `status === 1`.

6. **Handler: unknown service name returns SERVICE_UNKNOWN.** Call with
   `{ request: { service: "Nonexistent" } }`, assert `status === 3`.

7. **Server registers health service.** Use the existing mock pattern: create a
   Server with a mock gRPC factory, call `start()`, assert `addService` was
   called twice (once for the application service, once for the health
   service). Verify the second call's definition has a `Check` method with
   `path === "/grpc.health.v1.Health/Check"`.

8. **Health service bypasses auth.** Create a Server with a mock auth that
   tracks `validateCall` invocations. Call the health handler directly (from the
   second `addService` call's handlers). Assert `validateCall` was never called
   for the health handler.

### Test structure

```js
import { test, describe } from "node:test";
import assert from "node:assert";

import {
  healthDefinition,
  createHealthHandlers,
  ServingStatus,
  Server,
} from "../index.js";
import {
  createMockConfig,
  createMockGrpcFn,
  createMockObserverFn,
  createMockAuthFn,
  createMockLogger,
} from "@forwardimpact/libharness";

describe("healthDefinition", () => {
  // Tests 1-3: definition shape, serialization round-trips
});

describe("createHealthHandlers", () => {
  // Tests 4-6: handler behavior
});

describe("Server health registration", () => {
  // Tests 7-8: integration with Server.start()
});
```

## Verification

```sh
bun run node --test libraries/librpc/test/health.test.js
bun run check
```

## Blast Radius

- `libraries/librpc/health.js` -- **created** (health definition + handlers)
- `libraries/librpc/server.js` -- **modified** (1 import, 4 lines in `start()`)
- `libraries/librpc/index.js` -- **modified** (1 export line)
- `libraries/librpc/test/health.test.js` -- **created** (tests)

No changes to: generated code, codegen templates, individual services, or any
other library.
