import { test, describe } from "node:test";
import assert from "node:assert";

import { colors, supportsColor, colorize } from "../src/color.js";

describe("supportsColor", () => {
  test("returns false when NO_COLOR is set", () => {
    const proc = { env: { NO_COLOR: "1" }, stdout: { isTTY: true } };
    assert.strictEqual(supportsColor(proc), false);
  });

  test("returns true when FORCE_COLOR is set", () => {
    const proc = { env: { FORCE_COLOR: "1" }, stdout: { isTTY: false } };
    assert.strictEqual(supportsColor(proc), true);
  });

  test("returns true when stdout is a TTY", () => {
    const proc = { env: {}, stdout: { isTTY: true } };
    assert.strictEqual(supportsColor(proc), true);
  });

  test("returns false when stdout is not a TTY", () => {
    const proc = { env: {}, stdout: { isTTY: false } };
    assert.strictEqual(supportsColor(proc), false);
  });

  test("returns false when stdout is undefined", () => {
    const proc = { env: {} };
    assert.strictEqual(supportsColor(proc), false);
  });
});

describe("colorize", () => {
  test("wraps text with ANSI codes when the process supports color", () => {
    const proc = { env: { FORCE_COLOR: "1" }, stdout: { isTTY: true } };
    const result = colorize("hello", colors.red, proc);
    assert.strictEqual(result, `${colors.red}hello${colors.reset}`);
  });

  test("returns plain text when the process does not support color", () => {
    const proc = { env: {}, stdout: { isTTY: false } };
    const result = colorize("hello", colors.red, proc);
    assert.strictEqual(result, "hello");
  });
});
