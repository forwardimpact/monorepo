import { describe, test, beforeEach, mock } from "node:test";
import assert from "node:assert";

import { ValidationMiddleware, createValidationMiddleware } from "../index.js";

/**
 * Helper to create mock Hono context
 * @param {object} data - Request JSON body
 * @returns {object} Mock context
 */
function createMockContext(data) {
  return {
    req: { json: mock.fn(() => Promise.resolve(data)) },
    json: mock.fn((response, status) => ({ response, status })),
    set: mock.fn(),
  };
}

describe("ValidationMiddleware", () => {
  let validationMiddleware;

  beforeEach(() => {
    validationMiddleware = new ValidationMiddleware();
  });

  describe("constructor", () => {
    test("creates instance without config", () => {
      const middleware = new ValidationMiddleware();
      assert.ok(middleware instanceof ValidationMiddleware);
    });

    test("creates instance with config", () => {
      const mockConfig = { some: "config" };
      const middleware = new ValidationMiddleware(mockConfig);
      assert.ok(middleware instanceof ValidationMiddleware);
    });
  });

  describe("create() - Required Fields Validation", () => {
    test("passes when all required fields are present", async () => {
      const schema = { required: ["message", "user_id"] };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ message: "hello", user_id: "123" });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });

    test("rejects when required field is missing", async () => {
      const schema = { required: ["message", "user_id"] };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ message: "hello" });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(ctx.json.mock.callCount(), 1);
      assert.strictEqual(ctx.json.mock.calls[0].arguments[1], 400);
      assert.deepStrictEqual(ctx.json.mock.calls[0].arguments[0], {
        error: "Missing required field: user_id",
      });
    });

    test("rejects when required field is null", async () => {
      const schema = { required: ["message"] };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ message: null });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(ctx.json.mock.calls[0].arguments[1], 400);
    });

    test("rejects when required field is undefined", async () => {
      const schema = { required: ["message"] };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ message: undefined });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
    });
  });

  describe("create() - Type Validation", () => {
    test("passes when field types are correct", async () => {
      const schema = { types: { message: "string", count: "number" } };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ message: "hello", count: 42 });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });

    test("rejects when string field is wrong type", async () => {
      const schema = { types: { message: "string" } };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ message: 123 });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.deepStrictEqual(ctx.json.mock.calls[0].arguments[0], {
        error: "Field message must be a string",
      });
    });

    test("rejects when number field is wrong type", async () => {
      const schema = { types: { count: "number" } };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ count: "not a number" });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.deepStrictEqual(ctx.json.mock.calls[0].arguments[0], {
        error: "Field count must be a number",
      });
    });

    test("rejects when array field is wrong type", async () => {
      const schema = { types: { items: "array" } };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ items: "not an array" });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.deepStrictEqual(ctx.json.mock.calls[0].arguments[0], {
        error: "Field items must be a array",
      });
    });

    test("passes when array field is correct type", async () => {
      const schema = { types: { items: "array" } };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ items: [1, 2, 3] });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });

    test("skips validation for undefined fields", async () => {
      const schema = { types: { optional: "string" } };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ other: "value" });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });
  });

  describe("create() - Length Validation", () => {
    test("passes when string is within max length", async () => {
      const schema = { maxLengths: { message: 100 } };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ message: "short message" });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });

    test("rejects when string exceeds max length", async () => {
      const schema = { maxLengths: { message: 10 } };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ message: "this message is too long" });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.deepStrictEqual(ctx.json.mock.calls[0].arguments[0], {
        error: "Field message exceeds maximum length of 10",
      });
    });

    test("skips length check for non-string fields", async () => {
      const schema = { maxLengths: { count: 5 } };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ count: 123456 });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });
  });

  describe("create() - Data Sanitization", () => {
    test("sanitizes HTML in string fields", async () => {
      const schema = {};
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({
        message: "<script>alert('xss')</script>",
      });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      const validatedData = ctx.set.mock.calls.find(
        (c) => c.arguments[0] === "validatedData",
      );
      assert.ok(validatedData);
      assert.strictEqual(
        validatedData.arguments[1].message,
        "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;",
      );
    });

    test("preserves non-string fields during sanitization", async () => {
      const schema = {};
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ count: 42, active: true });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      const validatedData = ctx.set.mock.calls.find(
        (c) => c.arguments[0] === "validatedData",
      );
      assert.strictEqual(validatedData.arguments[1].count, 42);
      assert.strictEqual(validatedData.arguments[1].active, true);
    });

    test("escapes special HTML characters", async () => {
      const schema = {};
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ text: 'Test & "quotes" <tags>' });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      const validatedData = ctx.set.mock.calls.find(
        (c) => c.arguments[0] === "validatedData",
      );
      assert.strictEqual(
        validatedData.arguments[1].text,
        "Test &amp; &quot;quotes&quot; &lt;tags&gt;",
      );
    });
  });

  describe("create() - Invalid Request Data", () => {
    test("rejects null data", async () => {
      const schema = {};
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext(null);
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.deepStrictEqual(ctx.json.mock.calls[0].arguments[0], {
        error: "Invalid request data",
      });
    });

    test("rejects non-object data", async () => {
      const schema = {};
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext("string data");
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
    });
  });

  describe("create() - Combined Validation", () => {
    test("validates required, types, and lengths together", async () => {
      const schema = {
        required: ["message"],
        types: { message: "string", count: "number" },
        maxLengths: { message: 50 },
      };
      const middleware = validationMiddleware.create(schema);

      const ctx = createMockContext({ message: "hello", count: 42 });
      let nextCalled = false;

      await middleware(ctx, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });
  });
});

describe("createValidationMiddleware factory", () => {
  test("creates ValidationMiddleware instance without config", () => {
    const middleware = createValidationMiddleware();
    assert.ok(middleware instanceof ValidationMiddleware);
  });

  test("creates ValidationMiddleware instance with config", () => {
    const mockConfig = { setting: "value" };
    const middleware = createValidationMiddleware(mockConfig);
    assert.ok(middleware instanceof ValidationMiddleware);
  });
});
