import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCase } from "../../../scripts/capture-cli-golden.mjs";

// Real-bin byte-for-byte guard for the `gemba-xmr` CLI contract. Three files
// hold the product's goldens: golden.test.js renders the `gemba-wiki` help
// cases in-process, golden-functional.integration.test.js spawns the
// `gemba-wiki` bin over a fixture wiki, and this file spawns the `gemba-xmr`
// bin over every case in golden/gemba-xmr/cases.json. The replay spawns
// `node`, so it is an integration file. `runCase` applies each case's
// `transform` regexes before the comparison, and the capture script shares
// it, so replay and capture semantics cannot drift. The cases carry
// package-relative CSV paths and the root test runner starts at the
// repository root, so each case runs with the package root as its cwd.
const GEMBA_DIR = fileURLToPath(new URL("..", import.meta.url));
const BIN = join(GEMBA_DIR, "bin", "gemba-xmr.js");
const GOLDEN_DIR = join(GEMBA_DIR, "test", "golden", "gemba-xmr");

const cases = JSON.parse(readFileSync(join(GOLDEN_DIR, "cases.json"), "utf-8"));

function golden(file) {
  return readFileSync(join(GOLDEN_DIR, file), "utf-8");
}

describe("gemba-xmr golden CLI contract (real bin)", () => {
  for (const c of cases) {
    test(`${c.name} replays byte-identically`, () => {
      const res = runCase(BIN, c, { cwd: GEMBA_DIR });
      assert.equal(res.exitCode, c.exitCode, "exit code");
      assert.equal(res.stdout, golden(c.stdoutFile), "stdout");
      assert.equal(res.stderr, golden(c.stderrFile), "stderr");
    });
  }
});
