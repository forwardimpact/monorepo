import { test, describe } from "node:test";
import assert from "node:assert";

import {
  healthDefinition,
  createHealthHandlers,
  ServingStatus,
  Server,
} from "../src/index.js";
import {
  createMockConfig,
  createMockGrpcFn,
  createMockObserverFn,
  createMockAuthFn,
  createMockLogger,
} from "@forwardimpact/libharness";

describe("healthDefinition", () => {
  test("Check has the required service definition fields", () => {
    const check = healthDefinition.Check;
    assert.strictEqual(check.path, "/grpc.health.v1.Health/Check");
    assert.strictEqual(check.requestStream, false);
    assert.strictEqual(check.responseStream, false);
    assert.strictEqual(typeof check.requestSerialize, "function");
    assert.strictEqual(typeof check.requestDeserialize, "function");
    assert.strictEqual(typeof check.responseSerialize, "function");
    assert.strictEqual(typeof check.responseDeserialize, "function");
  });

  test("request serialization round-trip with service name", () => {
    const original = { service: "Graph" };
    const bytes = healthDefinition.Check.requestSerialize(original);
    const decoded = healthDefinition.Check.requestDeserialize(bytes);
    assert.strictEqual(decoded.service, "Graph");
  });

  test("request serialization round-trip with empty service", () => {
    const original = { service: "" };
    const bytes = healthDefinition.Check.requestSerialize(original);
    const decoded = healthDefinition.Check.requestDeserialize(bytes);
    assert.strictEqual(decoded.service, "");
  });

  test("response serialization round-trip SERVING", () => {
    const original = { status: ServingStatus.SERVING };
    const bytes = healthDefinition.Check.responseSerialize(original);
    const decoded = healthDefinition.Check.responseDeserialize(bytes);
    assert.strictEqual(decoded.status, ServingStatus.SERVING);
  });

  test("response serialization round-trip UNKNOWN (proto3 default)", () => {
    const original = { status: ServingStatus.UNKNOWN };
    const bytes = healthDefinition.Check.responseSerialize(original);
    const decoded = healthDefinition.Check.responseDeserialize(bytes);
    assert.strictEqual(decoded.status, ServingStatus.UNKNOWN);
  });

  test("response serialization round-trip SERVICE_UNKNOWN", () => {
    const original = { status: ServingStatus.SERVICE_UNKNOWN };
    const bytes = healthDefinition.Check.responseSerialize(original);
    const decoded = healthDefinition.Check.responseDeserialize(bytes);
    assert.strictEqual(decoded.status, ServingStatus.SERVICE_UNKNOWN);
  });
});

describe("createHealthHandlers", () => {
  test("empty service name returns SERVING", (_, done) => {
    const handlers = createHealthHandlers("Graph");
    handlers.Check({ request: { service: "" } }, (err, response) => {
      assert.strictEqual(err, null);
      assert.strictEqual(response.status, ServingStatus.SERVING);
      done();
    });
  });

  test("matching service name returns SERVING", (_, done) => {
    const handlers = createHealthHandlers("Graph");
    handlers.Check({ request: { service: "Graph" } }, (err, response) => {
      assert.strictEqual(err, null);
      assert.strictEqual(response.status, ServingStatus.SERVING);
      done();
    });
  });

  test("unknown service name returns SERVICE_UNKNOWN", (_, done) => {
    const handlers = createHealthHandlers("Graph");
    handlers.Check({ request: { service: "Nonexistent" } }, (err, response) => {
      assert.strictEqual(err, null);
      assert.strictEqual(response.status, ServingStatus.SERVICE_UNKNOWN);
      done();
    });
  });
});

describe("Server health registration", () => {
  test("start() registers health service alongside application service", async () => {
    const mockService = {
      getHandlers: () => ({
        TestMethod: async () => ({ result: "test" }),
      }),
    };

    const mockConfig = createMockConfig("memory", {
      host: "0.0.0.0",
      port: 5000,
    });
    const mockGrpcFn = createMockGrpcFn();
    const mockAuthFn = createMockAuthFn();
    const mockLogFn = createMockLogger();
    const mockObserverFn = createMockObserverFn(mockLogFn);

    const server = new Server(
      mockService,
      mockConfig,
      mockLogFn,
      null,
      mockObserverFn,
      mockGrpcFn,
      mockAuthFn,
    );

    await server.start();
    assert.ok(server);
  });

  test("health handlers bypass auth wrapping", async () => {
    let authCallCount = 0;
    const trackingAuthFn = () => ({
      createClientInterceptor: () => () => {},
      validateCall: () => {
        authCallCount++;
        return { isValid: true, serviceId: "test" };
      },
    });

    const mockService = {
      getHandlers: () => ({
        TestMethod: async () => ({ result: "test" }),
      }),
    };

    const mockConfig = createMockConfig("memory", {
      host: "0.0.0.0",
      port: 5000,
    });
    const mockGrpcFn = createMockGrpcFn();
    const mockLogFn = createMockLogger();
    const mockObserverFn = createMockObserverFn(mockLogFn);

    const server = new Server(
      mockService,
      mockConfig,
      mockLogFn,
      null,
      mockObserverFn,
      mockGrpcFn,
      trackingAuthFn,
    );

    await server.start();

    const handlers = createHealthHandlers("Memory");
    const initialCount = authCallCount;
    handlers.Check({ request: { service: "" } }, (err, response) => {
      assert.strictEqual(err, null);
      assert.strictEqual(response.status, ServingStatus.SERVING);
    });
    assert.strictEqual(authCallCount, initialCount);
  });
});
