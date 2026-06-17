import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { buildPrompt } from "../src/prompt.js";

describe("buildPrompt", () => {
  test("empty history returns the text alone (no Prior conversation block)", () => {
    const result = buildPrompt("hello", []);
    expect(result).toBe("hello");
  });

  test("with history composes Prior conversation block", () => {
    const result = buildPrompt("third", [
      { role: "user", text: "first" },
      { role: "assistant", text: "second" },
    ]);
    expect(result).toContain("User: first");
    expect(result).toContain("Agent: second");
    expect(result).toContain("Current message: third");
  });

  test("keeps only the last maxExchanges*2 entries", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      text: `m${i}`,
    }));
    const result = buildPrompt("now", history, { maxExchanges: 3 });
    expect(result).toContain("User: m24");
    expect(result).toContain("Agent: m29");
    expect(result).not.toContain("Agent: m23");
  });

  test("drops oldest entries until total length fits charCap", () => {
    const long = "x".repeat(1000);
    const history = [
      { role: "user", text: long },
      { role: "assistant", text: long },
      { role: "user", text: long },
    ];
    const result = buildPrompt("now", history, { charCap: 2500 });
    expect(result.length).toBeLessThanOrEqual(2500);
    expect(result).toContain("Current message: now");
  });

  test("falls back to text alone when history can never fit", () => {
    const giant = "x".repeat(10_000);
    const result = buildPrompt("now", [{ role: "user", text: giant }], {
      charCap: 100,
    });
    expect(result).toBe("now");
  });

  test("default maxExchanges and charCap match legacy values", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      text: `m${i}`,
    }));
    const result = buildPrompt("now", history);
    expect(result).toContain("User: m2\n");
    expect(result).not.toContain("User: m0");
    expect(result).not.toContain("Agent: m1\n");
  });
});
