import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Module under test
import { Policy } from "../index.js";
import { createMockStorage } from "@forwardimpact/libharness";

describe("libpolicy", () => {
  describe("Policy", () => {
    let mockStorage;
    let policy;

    beforeEach(() => {
      mockStorage = createMockStorage({
        get: mock.fn(() => Promise.resolve(Buffer.from("test data"))),
        list: mock.fn(() => Promise.resolve([])),
        path: mock.fn((key) => `/test/base/${key}`),
        ensureBucket: mock.fn(() => Promise.resolve(false)),
        bucketExists: mock.fn(() => Promise.resolve(true)),
      });

      policy = new Policy(mockStorage);
    });

    test("creates Policy with storage instance", () => {
      assert.ok(policy instanceof Policy);
    });

    test("throws error when storage is null", () => {
      assert.throws(() => new Policy(null), {
        message: "storage is required",
      });
    });

    test("throws error when storage is undefined", () => {
      assert.throws(() => new Policy(undefined), {
        message: "storage is required",
      });
    });

    test("load method completes successfully", async () => {
      await policy.load();

      // Verify that bucketExists was called
      assert.strictEqual(mockStorage.bucketExists.mock.callCount(), 1);
    });

    test("evaluate returns true for valid input", async () => {
      const input = {
        actor: "common.Assistant.hash0000",
        resources: ["common.Conversation.hash0001/common.Message.hash0002"],
      };

      const result = await policy.evaluate(input);

      assert.strictEqual(result, true);
    });

    test("evaluate processes actor information correctly", async () => {
      const input = {
        actor: "common.Assistant.hash0000",
        resources: ["common.Conversation.hash0001/common.Message.hash0002"],
      };

      const result = await policy.evaluate(input);

      assert.strictEqual(result, true);
    });

    test("evaluate throws error when input is null", async () => {
      await assert.rejects(() => policy.evaluate(null), {
        message: "input is required",
      });
    });

    test("evaluate throws error when input is undefined", async () => {
      await assert.rejects(() => policy.evaluate(undefined), {
        message: "input is required",
      });
    });

    test("evaluate throws error when actor is missing", async () => {
      const input = {
        resources: ["common.Conversation.hash0001/common.Message.hash0002"],
      };

      await assert.rejects(() => policy.evaluate(input), {
        message: "input.actor must be a non-empty string",
      });
    });

    test("evaluate throws error when actor is empty string", async () => {
      const input = {
        actor: "",
        resources: ["common.Conversation.hash0001/common.Message.hash0002"],
      };

      await assert.rejects(() => policy.evaluate(input), {
        message: "input.actor must be a non-empty string",
      });
    });

    test("evaluate throws error when actor is not string", async () => {
      const input = {
        actor: 123,
        resources: ["common.Conversation.hash0001/common.Message.hash0002"],
      };

      await assert.rejects(() => policy.evaluate(input), {
        message: "input.actor must be a non-empty string",
      });
    });

    test("evaluate throws error when resources is missing", async () => {
      const input = {
        actor: "common.Assistant.hash0000",
      };

      await assert.rejects(() => policy.evaluate(input), {
        message: "input.resources must be an array",
      });
    });

    test("evaluate throws error when resources is not array", async () => {
      const input = {
        actor: "common.Assistant.hash0000",
        resources: "not-an-array",
      };

      await assert.rejects(() => policy.evaluate(input), {
        message: "input.resources must be an array",
      });
    });

    test("evaluate handles empty resources array", async () => {
      const input = {
        actor: "common.Assistant.hash0000",
        resources: [],
      };

      const result = await policy.evaluate(input);

      assert.strictEqual(result, true);
    });

    test("evaluate handles multiple resources", async () => {
      const input = {
        actor: "common.Assistant.hash0000",
        resources: [
          "common.Conversation.hash0001/common.Message.hash0002",
          "common.Conversation.hash0001/common.Message.hash0003",
        ],
      };

      const result = await policy.evaluate(input);

      assert.strictEqual(result, true);
    });
  });

  describe("Integration Examples", () => {
    test("demonstrates TODO.md example usage", async () => {
      // Mock storage factory similar to the TODO.md example
      const mockStorage = {
        put: mock.fn(() => Promise.resolve()),
        get: mock.fn(() => Promise.resolve(Buffer.from("test data"))),
        delete: mock.fn(() => Promise.resolve()),
        exists: mock.fn(() => Promise.resolve(true)),
        findByExtension: mock.fn(() => Promise.resolve([])),
        getMany: mock.fn(() => Promise.resolve({})),
        findByPrefix: mock.fn(() => Promise.resolve([])),
        list: mock.fn(() => Promise.resolve([])),
        path: mock.fn((key) => `/test/base/${key}`),
        ensureBucket: mock.fn(() => Promise.resolve(false)),
        bucketExists: mock.fn(() => Promise.resolve(true)),
      };

      // Mock storageFactory to return our mock storage
      const mockStorageFactory = mock.fn(() => mockStorage);

      // Example usage from TODO.md
      const storage = mockStorageFactory("policies");
      const policy = new Policy(storage);
      await policy.load();

      // Example assistant (simplified since common.Assistant may not exist yet)
      const assistant = {
        meta: {
          name: "data-expert",
          uri: "common.Assistant.hash0000",
        },
      };

      // Example evaluation
      const allowed = await policy.evaluate({
        actor: assistant.meta.uri,
        resources: ["common.Conversation.hash0001/common.Message.hash0002"],
      });

      // Verify the expected behavior
      assert.strictEqual(allowed, true); // Always true for now
      assert.strictEqual(mockStorageFactory.mock.callCount(), 1);
      assert.deepStrictEqual(mockStorageFactory.mock.calls[0].arguments, [
        "policies",
      ]);
    });
  });
});
