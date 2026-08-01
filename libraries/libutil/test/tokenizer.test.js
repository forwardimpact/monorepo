import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

// Module under test
import { Tokenizer, ranks } from "../src/tokenizer.js";
import { countTokens, createTokenizer } from "../src/index.js";

describe("Tokenizer", () => {
  describe("constructor", () => {
    test("creates an instance with the ranks parameter", () => {
      const tokenizer = new Tokenizer(ranks);
      assert.ok(tokenizer instanceof Tokenizer);
    });

    test("creates an instance without the ranks parameter", () => {
      const tokenizer = new Tokenizer();
      assert.ok(tokenizer instanceof Tokenizer);
    });
  });

  describe("encode", () => {
    let tokenizer;

    beforeEach(() => {
      tokenizer = new Tokenizer(ranks);
    });

    test("handles an empty string", () => {
      const result = tokenizer.encode("");
      assert.strictEqual(result.length, 0);
    });

    test("handles non-string input", () => {
      const result = tokenizer.encode(null);
      assert.strictEqual(result.length, 0);
    });

    test("encodes a simple word", () => {
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

    test("provides a reasonable approximation", () => {
      // Test that the approximation is in a reasonable range
      const text = "This is a test sentence with about ten words here.";
      const result = tokenizer.encode(text);

      // Should be roughly 10-15 tokens for this sentence
      assert.ok(result.length >= 8);
      assert.ok(result.length <= 20);
    });
  });

  describe("decode", () => {
    test("throws an error when called", () => {
      const tokenizer = new Tokenizer(ranks);
      assert.throws(() => tokenizer.decode([1, 2, 3]), {
        message: /decode\(\) not implemented/,
      });
    });
  });
});

describe("Integration with libutil functions", () => {
  describe("tokenizerFactory", () => {
    test("creates a Tokenizer instance", () => {
      const tokenizer = createTokenizer();
      assert.ok(tokenizer instanceof Tokenizer);
    });
  });

  describe("countTokens", () => {
    test("returns the token count for the text", () => {
      const count = countTokens("hello world");
      assert.ok(typeof count === "number");
      assert.ok(count >= 1);
    });

    test("handles empty text", () => {
      const count = countTokens("");
      assert.strictEqual(count, 0);
    });

    test("uses the provided tokenizer", () => {
      const customTokenizer = new Tokenizer(ranks);
      const count = countTokens("test", customTokenizer);
      assert.ok(typeof count === "number");
      assert.ok(count >= 1);
    });

    test("uses the default tokenizer when the caller provides none", () => {
      const count = countTokens("test");
      assert.ok(typeof count === "number");
      assert.ok(count >= 1);
    });
  });
});
