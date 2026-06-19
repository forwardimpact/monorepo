import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SELECTOR_DIRS, SELECTOR_PREDICATE } from "../scripts/test-gate.mjs";

// The gate set has ONE source of truth: if `test:gate`'s selector and the
// `test` script's selector fork, the gate set forks. This test
// reconstructs the `test` script's `find … | xargs bun test` command from the
// gate wrapper's exported selector and asserts package.json's `test` script
// begins with it byte-for-byte, so a drift in either reddens the gate. The
// `test` script may append bun runner flags (e.g. `--timeout=30000`) after the
// shared selector — those tune the informational bun loop and do not change the
// gate set; only the selector prefix is the single source of truth.
describe("test:gate selector is the single source of truth", () => {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
  );

  test("package.json `test` selector equals the gate wrapper's selector", () => {
    // Shell-quote the predicate as it appears in package.json: glob/path values
    // are single-quoted, the flags are bare.
    const predicate = SELECTOR_PREDICATE.map((part) =>
      part.startsWith("-") ? part : `'${part}'`,
    );
    const findCmd = `find ${SELECTOR_DIRS.join(" ")} ${predicate.join(" ")}`;
    const prefix = `${findCmd} | xargs bun test`;
    assert.ok(
      pkg.scripts.test === prefix || pkg.scripts.test.startsWith(`${prefix} `),
      `package.json \`test\` selector drifted from scripts/test-gate.mjs SELECTOR_DIRS/SELECTOR_PREDICATE — they must stay identical. Expected \`test\` to be (or start with) "${prefix}", got "${pkg.scripts.test}"`,
    );
  });
});
