import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Byte-for-byte CLI-contract guard: the bin must keep producing the
// snapshots captured in golden/jidoka/. Spawn-based replay (unlike the
// gemba product's in-process render) because the jidoka definition lives
// inline in the bin, not behind a library export. Each case's `transform`
// regexes normalise non-deterministic output (the version) before the
// comparison; `scripts/capture-cli-golden.mjs` regenerates the snapshots.
const GOLDEN_DIR = fileURLToPath(new URL("./golden/jidoka", import.meta.url));
const BIN = fileURLToPath(new URL("../bin/jidoka.js", import.meta.url));

const cases = JSON.parse(readFileSync(join(GOLDEN_DIR, "cases.json"), "utf-8"));

function golden(file) {
  return readFileSync(join(GOLDEN_DIR, file), "utf-8");
}

function applyTransforms(text, transform = []) {
  let out = text;
  for (const { pattern, replacement } of transform) {
    out = out.replace(new RegExp(pattern, "g"), replacement);
  }
  return out;
}

describe("jidoka golden CLI contract", () => {
  for (const c of cases) {
    test(`${c.name} replays byte-identically`, () => {
      const res = spawnSync("node", [BIN, ...c.args], {
        encoding: "utf-8",
        env: { ...process.env, ...(c.env ?? {}) },
      });
      assert.equal(res.status, c.exitCode, "exit code");
      assert.equal(
        applyTransforms(res.stdout, c.transform),
        golden(c.stdoutFile),
        "stdout",
      );
      assert.equal(
        applyTransforms(res.stderr, c.transform),
        golden(c.stderrFile),
        "stderr",
      );
    });
  }
});
