import { test, describe } from "node:test";
import assert from "node:assert";

import { isCapability } from "../src/modifiers.js";

describe("modifiers", () => {
  describe("isCapability", () => {
    test("returns true for valid capabilities", () => {
      assert.strictEqual(isCapability("delivery"), true);
      assert.strictEqual(isCapability("scale"), true);
      assert.strictEqual(isCapability("reliability"), true);
      assert.strictEqual(isCapability("data"), true);
      assert.strictEqual(isCapability("ai"), true);
      assert.strictEqual(isCapability("ml"), true);
      assert.strictEqual(isCapability("process"), true);
      assert.strictEqual(isCapability("business"), true);
      assert.strictEqual(isCapability("people"), true);
      assert.strictEqual(isCapability("documentation"), true);
      assert.strictEqual(isCapability("product"), true);
    });

    test("returns false for invalid capabilities", () => {
      assert.strictEqual(isCapability("unknown"), false);
      assert.strictEqual(isCapability(""), false);
      assert.strictEqual(isCapability("DELIVERY"), false);
    });
  });
});
