import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { PassThrough } from "stream";

import { Client } from "../index.js";
import {
  createMockGrpcFn,
  createMockObserverFn,
  createMockAuthFn,
  createMockLogger,
} from "@forwardimpact/libharness";

describe("Client", () => {
  let mockConfig;
  let mockGrpcFn;
  let mockAuthFn;
  let mockLogFn;
  let mockObserverFn;
  let mockClientInstance;

  beforeEach(() => {
    mockConfig = {
      name: "memory", // Use a valid service name that exists in definitions
      host: "0.0.0.0",
      port: 5000,
    };

    mockClientInstance = {
      TestMethod: mock.fn((_req, _meta, cb) => cb(null, { result: "success" })),
      StreamMethod: mock.fn((_req, _meta) => {
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
        makeGenericClientConstructor: mock.fn(() => {
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
    assert.throws(
      () =>
        new Client(
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
    const client = new Client(
      mockConfig,
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
      mockLogFn,
      null,
      mockObserverFn,
      mockGrpcFn,
      mockAuthFn,
    );

    const response = await client.callUnary("TestMethod", { some: "data" });
    assert.deepStrictEqual(response, { result: "success" });
    assert.strictEqual(mockClientInstance.TestMethod.mock.callCount(), 1);
  });

  test("callStream should execute streaming call", async () => {
    const client = new Client(
      mockConfig,
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
      mockLogFn,
      {}, // tracer
      mockObserverFn,
      mockGrpcFn,
      mockAuthFn,
    );
    assert.ok(client);
  });
});
