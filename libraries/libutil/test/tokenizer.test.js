import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

// Module under test
import { Tokenizer, ranks } from "../tokenizer.js";
import { countTokens, createTokenizer } from "../index.js";

describe("Tokenizer", () => {
  describe("constructor", () => {
    test("creates instance with ranks parameter", () => {
      const tokenizer = new Tokenizer(ranks);
      assert.ok(tokenizer instanceof Tokenizer);
    });

    test("creates instance without ranks parameter", () => {
      const tokenizer = new Tokenizer();
      assert.ok(tokenizer instanceof Tokenizer);
    });
  });

  describe("encode", () => {
    let tokenizer;

    beforeEach(() => {
      tokenizer = new Tokenizer(ranks);
    });

    test("handles empty string", () => {
      const result = tokenizer.encode("");
      assert.strictEqual(result.length, 0);
    });

    test("handles non-string input", () => {
      const result = tokenizer.encode(null);
      assert.strictEqual(result.length, 0);
    });

    test("encodes simple word", () => {
      const result = tokenizer.encode("hello");
      assert.ok(result.length >= 1);
      assert.ok(Array.isArray(result));
    });

    test("encodes longer text", () => {
      const shortText = "hello";
      const longText = "hello world this is a longer piece of text";

      const shortResult = tokenizer.encode(shortText);
      const longResult = tokenizer.encode(longText);

      assert.ok(longResult.length > shortResult.length);
    });

    test("handles whitespace-only text", () => {
      const result = tokenizer.encode("   ");
      assert.strictEqual(result.length, 0);
    });

    test("handles punctuation", () => {
      const result = tokenizer.encode("Hello, world!");
      assert.ok(result.length >= 3); // At least hello + comma + world + exclamation
    });

    test("handles mixed content", () => {
      const result = tokenizer.encode("The year 2024 was great!");
      assert.ok(result.length >= 5); // Multiple words and punctuation
    });

    test("provides reasonable approximation", () => {
      // Test that the approximation is in a reasonable range
      const text = "This is a test sentence with about ten words here.";
      const result = tokenizer.encode(text);

      // Should be roughly 10-15 tokens for this sentence
      assert.ok(result.length >= 8);
      assert.ok(result.length <= 20);
    });
  });

  describe("decode", () => {
    test("throws error when called", () => {
      const tokenizer = new Tokenizer(ranks);
      assert.throws(() => tokenizer.decode([1, 2, 3]), {
        message: /decode\(\) not implemented/,
      });
    });
  });
});

describe("Integration with libutil functions", () => {
  describe("tokenizerFactory", () => {
    test("creates Tokenizer instance", () => {
      const tokenizer = createTokenizer();
      assert.ok(tokenizer instanceof Tokenizer);
    });
  });

  describe("countTokens", () => {
    test("returns token count for text", () => {
      const count = countTokens("hello world");
      assert.ok(typeof count === "number");
      assert.ok(count >= 1);
    });

    test("handles empty text", () => {
      const count = countTokens("");
      assert.strictEqual(count, 0);
    });

    test("uses provided tokenizer", () => {
      const customTokenizer = new Tokenizer(ranks);
      const count = countTokens("test", customTokenizer);
      assert.ok(typeof count === "number");
      assert.ok(count >= 1);
    });

    test("uses default tokenizer when none provided", () => {
      const count = countTokens("test");
      assert.ok(typeof count === "number");
      assert.ok(count >= 1);
    });
  });
});
