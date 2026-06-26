import { describe, test } from "node:test";
import assert from "node:assert";

import { stripSignatures } from "@forwardimpact/libharness";

describe("stripSignatures", () => {
  test("strips signature from thinking blocks", () => {
    const input = {
      type: "thinking",
      thinking: "internal reasoning",
      signature: "dGVzdC1zaWduYXR1cmU=",
    };
    const result = stripSignatures(input);

    assert.strictEqual(result.type, "thinking");
    assert.strictEqual(result.thinking, "internal reasoning");
    assert.strictEqual(result.signature, undefined);
    assert.ok(!("signature" in result));
  });

  test("preserves signature on non-thinking objects", () => {
    const input = { type: "text", signature: "keep-me" };
    const result = stripSignatures(input);

    assert.strictEqual(result.type, "text");
    assert.strictEqual(result.signature, "keep-me");
  });

  test("strips thinking signatures nested in turn content arrays", () => {
    const input = {
      turns: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "reasoning", signature: "sig1" },
            { type: "text", text: "Hello" },
          ],
        },
      ],
    };
    const result = stripSignatures(input);

    assert.strictEqual(result.turns[0].content[0].signature, undefined);
    assert.strictEqual(result.turns[0].content[0].thinking, "reasoning");
    assert.strictEqual(result.turns[0].content[1].type, "text");
  });

  test("handles null and primitive inputs", () => {
    assert.strictEqual(stripSignatures(null), null);
    assert.strictEqual(stripSignatures("string"), "string");
    assert.strictEqual(stripSignatures(42), 42);
    assert.strictEqual(stripSignatures(true), true);
    assert.strictEqual(stripSignatures(undefined), undefined);
  });

  test("walks arrays element by element", () => {
    const input = [
      { type: "thinking", signature: "x" },
      { type: "text", signature: "y" },
    ];
    const result = stripSignatures(input);

    assert.strictEqual(result[0].signature, undefined);
    assert.strictEqual(result[1].signature, "y");
  });

  test("strips thinking signatures at arbitrary depth", () => {
    const input = {
      a: { b: { c: { type: "thinking", signature: "deep" } } },
    };
    const result = stripSignatures(input);

    assert.strictEqual(result.a.b.c.signature, undefined);
    assert.strictEqual(result.a.b.c.type, "thinking");
  });

  test("does not mutate the input", () => {
    const input = {
      type: "thinking",
      thinking: "reasoning",
      signature: "sig",
    };
    stripSignatures(input);

    assert.strictEqual(input.signature, "sig");
  });
});
