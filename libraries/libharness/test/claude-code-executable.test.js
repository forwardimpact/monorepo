import { describe, test } from "node:test";
import assert from "node:assert";

import { resolveClaudeCodeExecutable } from "@forwardimpact/libharness";

describe("resolveClaudeCodeExecutable", () => {
  test("returns undefined from source (not compiled), never touching PATH", () => {
    let called = false;
    const which = () => {
      called = true;
      return "/should/not/be/used";
    };
    assert.strictEqual(
      resolveClaudeCodeExecutable({ isCompiled: false, which }),
      undefined,
    );
    assert.strictEqual(called, false);
  });

  test("returns the resolved path when compiled and claude is on PATH", () => {
    assert.strictEqual(
      resolveClaudeCodeExecutable({
        isCompiled: true,
        which: (cmd) => (cmd === "claude" ? "/home/runner/.local/bin/claude" : null),
      }),
      "/home/runner/.local/bin/claude",
    );
  });

  test("returns undefined when compiled but claude is not on PATH", () => {
    assert.strictEqual(
      resolveClaudeCodeExecutable({ isCompiled: true, which: () => null }),
      undefined,
    );
  });
});
