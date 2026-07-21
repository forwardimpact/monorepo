import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCase } from "../../../scripts/capture-cli-golden.mjs";

// Byte-for-byte CLI-contract guard: the bin must keep producing the
// snapshots captured in golden/jidoka/. Spawn-based replay (unlike the
// gemba product's in-process render) because the jidoka definition lives
// inline in the bin, not behind a library export. `runCase` — shared with
// the capture script so replay and capture semantics cannot drift — applies
// each case's `transform` regexes (normalising the version) before the
// comparison.
const GOLDEN_DIR = fileURLToPath(new URL("./golden/jidoka", import.meta.url));
const BIN = fileURLToPath(new URL("../bin/jidoka.js", import.meta.url));

const cases = JSON.parse(readFileSync(join(GOLDEN_DIR, "cases.json"), "utf-8"));

function golden(file) {
  return readFileSync(join(GOLDEN_DIR, file), "utf-8");
}

describe("jidoka golden CLI contract", () => {
  for (const c of cases) {
    test(`${c.name} replays byte-identically`, () => {
      const res = runCase(BIN, c);
      assert.equal(res.exitCode, c.exitCode, "exit code");
      assert.equal(res.stdout, golden(c.stdoutFile), "stdout");
      assert.equal(res.stderr, golden(c.stderrFile), "stderr");
    });
  }
});
