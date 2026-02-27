import { test, describe } from "node:test";
import assert from "node:assert";

import { common } from "../index.js";

describe("libtype", () => {
  describe("Simple type", () => {
    test("creates type with required properties", () => {
      const message = new common.Message({
        role: "user",
        content: {
          text: "Test content",
        },
      });

      assert.strictEqual(message.role, "user");
      assert.strictEqual(message.content.text, "Test content");
    });

    test("type is of the correct instance", () => {
      const message = new common.Message({
        role: "assistant",
        content: {
          text: "Instance check",
        },
      });

      assert.ok(message instanceof common.Message);
    });
  });
});
