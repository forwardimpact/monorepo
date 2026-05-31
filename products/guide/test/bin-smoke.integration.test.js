import { test, describe } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// SC5 smoke test: spawn the real fit-guide bin to verify the runtime wiring
// (createDefaultRuntime + the librepl one-shot command path) end to end. The
// `--version` flag runs before any network setup, so it is deterministic.
const binPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "bin",
  "fit-guide.js",
);

describe("fit-guide bin smoke", () => {
  test("--version prints the version and exits 0", () => {
    const out = execFileSync("node", [binPath, "--version"], {
      encoding: "utf8",
      env: { ...process.env, FIT_GUIDE_VERSION: "9.9.9-smoke" },
    });
    assert.equal(out, "fit-guide v9.9.9-smoke\n");
  });
});
