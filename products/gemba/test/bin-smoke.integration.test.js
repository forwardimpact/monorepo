import { describe, test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Per-bin smoke tests: spawn each gemba bin with `--version`
// and assert it exits 0 and prints a semver-shaped line. This is the one
// legitimate subprocess test per binary, so it lives in an
// `*.integration.test.js` file (exempt from the subprocess-in-tests invariant).

const BINS = [
  "gemba-harness",
  "gemba-benchmark",
  "gemba-trace",
  "gemba-selfedit",
  "gemba-wiki",
  "gemba-xmr",
];

function binPath(name) {
  return fileURLToPath(new URL(`../bin/${name}.js`, import.meta.url));
}

describe("bin --version smoke", () => {
  for (const name of BINS) {
    test(`${name} --version exits 0 with a semver line`, () => {
      const r = spawnSync("node", [binPath(name), "--version"], {
        encoding: "utf8",
      });
      assert.strictEqual(r.status, 0, r.stderr);
      assert.match(r.stdout.trim(), /\d+\.\d+\.\d+/);
    });
  }
});
