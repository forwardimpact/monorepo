import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { PassThrough } from "stream";

import { Client } from "../src/index.js";
import {
  assertThrowsMessage,
  createMockAuthFn,
  createMockGrpcFn,
  createMockLogger,
  createMockObserverFn,
  createTestRuntime,
  spy,
} from "@forwardimpact/libmock";

describe("Client", () => {
  let mockConfig;
  let mockRuntime;
  let mockGrpcFn;
  let mockAuthFn;
  let mockLogFn;
  let mockObserverFn;
  let mockClientInstance;

  beforeEach(() => {
    mockRuntime = createTestRuntime();
    mockConfig = {
      name: "graph", // Use a valid service name that exists in definitions
      host: "0.0.0.0",
      port: 5000,
    };

    mockClientInstance = {
      TestMethod: spy((_req, _meta, _opts, cb) =>
        cb(null, { result: "success" }),
      ),
      StreamMethod: spy((_req, _meta) => {
        const stream = new PassThrough({ objectMode: true });
        process.nextTick(() => {
          stream.emit("metadata", {});
          stream.write({ result: "chunk1" });
          stream.write({ result: "chunk2" });
          stream.end();
        });
        return stream;
      }),
    };

    mockGrpcFn = createMockGrpcFn({
      grpc: {
        Metadata: class {},
        makeGenericClientConstructor: spy(() => {
          return function () {
            return mockClientInstance;
          };
        }),
      },
    });

    mockAuthFn = createMockAuthFn();

    mockLogFn = createMockLogger();

    mockObserverFn = createMockObserverFn();
  });

  test("should require config parameter", () => {
    assertThrowsMessage(
      () =>
        new Client(
          null,
          mockRuntime,
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
    const client = new Client(
      mockConfig,
      mockRuntime,
      mockLogFn,
      null,
      mockObserverFn,
      mockGrpcFn,
      mockAuthFn,
    );

    assert.ok(client);
    assert.strictEqual(client.config, mockConfig);
  });

  test("callUnary should execute unary call", async () => {
    const client = new Client(
      mockConfig,
      mockRuntime,
      mockLogFn,
      null,
      mockObserverFn,
      mockGrpcFn,
      mockAuthFn,
    );

    const response = await client.callUnary("TestMethod", { some: "data" });
    assert.deepStrictEqual(response, { result: "success" });
    assert.strictEqual(mockClientInstance.TestMethod.mock.callCount(), 1);
    const options = mockClientInstance.TestMethod.mock.calls[0].arguments[2];
    assert.strictEqual(typeof options.deadline, "number");
  });

  test("callStream should execute streaming call", async () => {
    const client = new Client(
      mockConfig,
      mockRuntime,
      mockLogFn,
      null,
      mockObserverFn,
      mockGrpcFn,
      mockAuthFn,
    );

    const stream = client.callStream("StreamMethod", { some: "data" });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    assert.strictEqual(chunks.length, 2);
    assert.deepStrictEqual(chunks[0], { result: "chunk1" });
    assert.deepStrictEqual(chunks[1], { result: "chunk2" });
    assert.strictEqual(mockClientInstance.StreamMethod.mock.callCount(), 1);
  });

  test("should accept tracer parameter", () => {
    const client = new Client(
      mockConfig,
      mockRuntime,
      mockLogFn,
      {}, // tracer
      mockObserverFn,
      mockGrpcFn,
      mockAuthFn,
    );
    assert.ok(client);
  });
});
