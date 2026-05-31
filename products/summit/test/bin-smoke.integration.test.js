import { test, describe } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// SC5 smoke test: spawn the real fit-summit bin to verify the runtime wiring
// (createDefaultRuntime threaded through cli.parse) end to end. `--version` and
// `--help` run before any data load, so they are deterministic.
const binPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "bin",
  "fit-summit.js",
);

describe("fit-summit bin smoke", () => {
  test("--version prints the version and exits 0", () => {
    const out = execFileSync("node", [binPath, "--version"], {
      encoding: "utf8",
      env: { ...process.env, FIT_SUMMIT_VERSION: "9.9.9-smoke" },
    });
    assert.equal(out.trim(), "9.9.9-smoke");
  });

  test("--help lists the command surface and exits 0", () => {
    const out = execFileSync("node", [binPath, "--help"], { encoding: "utf8" });
    assert.match(out, /Commands:/);
    assert.match(out, /coverage <team>/);
  });
});
