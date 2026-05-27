import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { Server } from "../src/index.js";
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
        new Server(
          null,
          mockConfig,
          mockLogFn,
          null,
          mockObserverFn,
          mockGrpcFn,
          mockAuthFn,
        ),
      /service is required/,
    );
  });

  test("should require config parameter", () => {
    assertThrowsMessage(
      () =>
        new Server(
          mockService,
          null,
          mockLogFn,
          null,
          mockObserverFn,
          mockGrpcFn,
          mockAuthFn,
        ),
      /config is required/,
    );
  });

  test("should accept valid parameters", () => {
    const server = new Server(
      mockService,
      mockConfig,
      mockLogFn,
      null,
      mockObserverFn,
      mockGrpcFn,
      mockAuthFn,
    );

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

    const server = new Server(
      spiedService,
      mockConfig,
      mockLogFn,
      null,
      mockObserverFn,
      mockGrpcFn,
      mockAuthFn,
    );

    // Start the server to trigger setup
    await server.start();

    assert.strictEqual(getHandlersSpy.mock.callCount(), 1);
  });

  test("should accept tracer parameter", () => {
    const mockTracer = createMockTracer();

    const server = new Server(
      mockService,
      mockConfig,
      mockLogFn,
      mockTracer,
      mockObserverFn,
      mockGrpcFn,
      mockAuthFn,
    );

    assert.ok(server);
  });
});
