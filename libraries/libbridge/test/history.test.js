import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { appendHistory } from "../src/history.js";

describe("appendHistory", () => {
  test("appends new entries in order", () => {
    const history = [];
    appendHistory(history, { role: "user", text: "a" });
    appendHistory(history, { role: "assistant", text: "b" });
    expect(history).toEqual([
      { role: "user", text: "a" },
      { role: "assistant", text: "b" },
    ]);
  });

  test("drops oldest entries once maxEntries is exceeded", () => {
    const history = [];
    for (let i = 0; i < 12; i++) {
      appendHistory(history, { role: "user", text: `m${i}` });
    }
    expect(history.length).toBe(10);
    expect(history[0].text).toBe("m2");
    expect(history[9].text).toBe("m11");
  });

  test("respects a custom maxEntries", () => {
    const history = [];
    for (let i = 0; i < 5; i++) {
      appendHistory(
        history,
        { role: "user", text: `m${i}` },
        { maxEntries: 3 },
      );
    }
    expect(history.length).toBe(3);
    expect(history.map((e) => e.text)).toEqual(["m2", "m3", "m4"]);
  });

  test("mutates in place (legacy contract)", () => {
    const history = [];
    const ref = history;
    appendHistory(history, { role: "user", text: "a" });
    expect(history).toBe(ref);
  });
});
