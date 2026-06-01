import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { Server } from "../src/index.js";
import { createTestRuntime } from "@forwardimpact/libmock";
import {
  assertThrowsMessage,
  createMockAuthFn,
  createMockConfig,
  createMockGrpcFn,
  createMockLogger,
  createMockObserverFn,
  createMockTracer,
  spy,
} from "@forwardimpact/libmock";

const runtime = createTestRuntime();

describe("Server", () => {
  let mockService;
  let mockConfig;
  let mockGrpcFn;
  let mockAuthFn;
  let mockLogFn;
  let mockObserverFn;

  beforeEach(() => {
    mockService = {
      getHandlers: () => ({
        TestMethod: async (_call) => ({ result: "test" }),
      }),
    };

    mockConfig = createMockConfig("graph", { host: "0.0.0.0", port: 5000 });
    mockGrpcFn = createMockGrpcFn();
    mockAuthFn = createMockAuthFn();
    mockLogFn = createMockLogger();
    mockObserverFn = createMockObserverFn(mockLogFn);
  });

  test("should require service parameter", () => {
    assertThrowsMessage(
      () =>
        new Server(null, mockConfig, {
          logger: mockLogFn,
          tracer: null,
          observerFn: mockObserverFn,
          grpcFn: mockGrpcFn,
          authFn: mockAuthFn,
          runtime,
        }),
      /service is required/,
    );
  });

  test("should require config parameter", () => {
    assertThrowsMessage(
      () =>
        new Server(mockService, null, {
          logger: mockLogFn,
          tracer: null,
          observerFn: mockObserverFn,
          grpcFn: mockGrpcFn,
          authFn: mockAuthFn,
          runtime,
        }),
      /config is required/,
    );
  });

  test("should accept valid parameters", () => {
    const server = new Server(mockService, mockConfig, {
      logger: mockLogFn,
      tracer: null,
      observerFn: mockObserverFn,
      grpcFn: mockGrpcFn,
      authFn: mockAuthFn,
      runtime,
    });

    assert.ok(server);
    assert.strictEqual(server.config, mockConfig);
  });

  test("should call service methods during setup", async () => {
    const getHandlersSpy = spy(() => ({
      TestMethod: async () => ({ result: "test" }),
    }));

    const spiedService = {
      getHandlers: getHandlersSpy,
    };

    const server = new Server(spiedService, mockConfig, {
      logger: mockLogFn,
      tracer: null,
      observerFn: mockObserverFn,
      grpcFn: mockGrpcFn,
      authFn: mockAuthFn,
      runtime,
    });

    // Start the server to trigger setup
    await server.start();

    assert.strictEqual(getHandlersSpy.mock.callCount(), 1);
  });

  test("should propagate handler-thrown .code to the callback", async () => {
    let capturedHandlers;
    const customGrpcFn = createMockGrpcFn({
      server: {
        addService: spy((_def, handlers) => {
          if (!capturedHandlers) capturedHandlers = handlers;
        }),
      },
    });

    const throwingService = {
      getHandlers: () => ({
        FailingMethod: async () => {
          throw Object.assign(new Error("nope"), {
            code: customGrpcFn().grpc.status.NOT_FOUND,
          });
        },
      }),
    };

    const customObserverFn = () => ({
      observeServerUnaryCall: async (_method, _call, fn) => await fn(_call),
      logger: () => mockLogFn,
    });

    const server = new Server(throwingService, mockConfig, {
      logger: mockLogFn,
      tracer: null,
      observerFn: customObserverFn,
      grpcFn: customGrpcFn,
      authFn: mockAuthFn,
      runtime,
    });

    await server.start();

    const result = await new Promise((resolve) => {
      capturedHandlers.FailingMethod({ request: {} }, resolve);
    });

    assert.strictEqual(result.code, customGrpcFn().grpc.status.NOT_FOUND);
    assert.strictEqual(result.message, "nope");
  });

  test("should accept tracer parameter", () => {
    const mockTracer = createMockTracer();

    const server = new Server(mockService, mockConfig, {
      logger: mockLogFn,
      tracer: mockTracer,
      observerFn: mockObserverFn,
      grpcFn: mockGrpcFn,
      authFn: mockAuthFn,
      runtime,
    });

    assert.ok(server);
  });
});
