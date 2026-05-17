/**
 * Verifies the hidden `_commands` argv branch on fit-landmark.js. This
 * branch must run BEFORE the top-level `await createProductConfig` so
 * substrate-smoke's introspection does not pay the libconfig load cost
 * and is independent of the spawn cwd's `.env` or `config/` walk.
 *
 * If a future contributor moves createProductConfig earlier in the bin,
 * this test will fail because the spawn will be unable to find a
 * supabase URL/anon key and exit with an unrelated error.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(__dirname, "..", "..", "bin", "fit-landmark.js");

describe("fit-landmark _commands hidden verb", () => {
  test("emits the manifest JSON shape and exits 0 with no config", () => {
    // Pin spawn cwd to a fresh tmpdir so libconfig has neither a .env
    // nor a discoverable config/ directory; this verifies the verb sits
    // above the top-level createProductConfig await.
    const cwd = mkdtempSync(resolve(tmpdir(), "landmark-_commands-"));
    try {
      const res = spawnSync("node", [BIN, "_commands"], {
        // Strip every PRODUCT_LANDMARK_*, SUPABASE_* env to make sure
        // the verb does not depend on them.
        env: { PATH: process.env.PATH },
        encoding: "utf8",
        cwd,
      });
      assert.equal(
        res.status,
        0,
        `_commands exited ${res.status}: ${res.stderr}`,
      );
      const parsed = JSON.parse(res.stdout);
      assert.ok(parsed.commands, "missing commands");
      assert.ok(parsed.subcommandExpansions, "missing subcommandExpansions");
      assert.ok(parsed.flatSmokeOptions, "missing flatSmokeOptions");
      assert.ok(parsed.commands.org, "missing org command");
      assert.equal(parsed.commands.org.needsSupabase, true);
    } finally {
      try {
        rmSync(cwd, { recursive: true });
      } catch {
        // ignore
      }
    }
  });
});
