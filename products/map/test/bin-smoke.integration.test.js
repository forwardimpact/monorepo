import { test, describe } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// SC5 smoke tests: spawn each real bin to verify the runtime wiring
// (createDefaultRuntime threaded from the bin) end to end. `--version` runs
// before any data load or Supabase setup, so it is deterministic and
// network-free.
const binDir = join(dirname(fileURLToPath(import.meta.url)), "..", "bin");

describe("fit-map bin smoke", () => {
  test("--version prints the version and exits 0", () => {
    const out = execFileSync(
      "node",
      [join(binDir, "fit-map.js"), "--version"],
      {
        encoding: "utf8",
        env: { ...process.env, FIT_MAP_VERSION: "9.9.9-smoke" },
      },
    );
    assert.equal(out, "9.9.9-smoke\n");
  });
});

describe("dispatch-substrate bin smoke", () => {
  test("--version prints the version and exits 0", () => {
    const out = execFileSync(
      "node",
      [join(binDir, "dispatch-substrate.js"), "--version"],
      {
        encoding: "utf8",
        env: { ...process.env, FIT_MAP_VERSION: "9.9.9-smoke" },
      },
    );
    assert.equal(out, "9.9.9-smoke\n");
  });
});
