import { describe, test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Per-bin smoke test: spawn the fit-outpost bin with `--version`
// and assert it exits 0 and prints a semver-shaped line. This is the one
// legitimate subprocess test for the binary, so it lives in an
// `*.integration.test.js` file (exempt from the subprocess-in-tests invariant).

function binPath() {
  return fileURLToPath(new URL("../bin/fit-outpost.js", import.meta.url));
}

describe("fit-outpost bin --version smoke", () => {
  test("--version exits 0 with a semver line", () => {
    const r = spawnSync("node", [binPath(), "--version"], {
      encoding: "utf8",
    });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout.trim(), /\d+\.\d+\.\d+/);
  });
});
