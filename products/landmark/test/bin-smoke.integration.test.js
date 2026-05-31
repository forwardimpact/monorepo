import { test, describe } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// SC5 smoke test: spawn the real fit-landmark bin to verify the runtime
// wiring (createDefaultRuntime threaded from the bin into the dispatcher) end
// to end. The `--version` flag runs before any data load or Supabase setup,
// so it is deterministic and network-free.
const binPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "bin",
  "fit-landmark.js",
);

describe("fit-landmark bin smoke", () => {
  test("--version prints the version and exits 0", () => {
    const out = execFileSync("node", [binPath, "--version"], {
      encoding: "utf8",
      env: { ...process.env, FIT_LANDMARK_VERSION: "9.9.9-smoke" },
    });
    assert.equal(out, "9.9.9-smoke\n");
  });
});
