/**
 * Verifies the hidden `_commands` argv branch on fit-landmark.js. The
 * branch must run BEFORE the top-level `await createProductConfig` so
 * substrate-smoke's introspection does not pay the libconfig load cost.
 *
 * Two spawn paths exercised:
 *   1. Direct `node bin/fit-landmark.js _commands` from a fresh tmpdir —
 *      proves the verb is above the libconfig load (no .env / config/
 *      walk required).
 *   2. `bunx fit-landmark _commands` from the parent (workspace) cwd —
 *      proves substrate-smoke's production spawn shape resolves the
 *      package via workspace `node_modules/.bin` rather than fetching
 *      from npm (which would 404 the published "fit-landmark" name).
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

function assertManifestShape(stdout) {
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.commands, "missing commands");
  assert.ok(parsed.subcommandExpansions, "missing subcommandExpansions");
  assert.ok(parsed.flatSmokeOptions, "missing flatSmokeOptions");
  assert.ok(parsed.commands.org, "missing org command");
  assert.equal(parsed.commands.org.needsSupabase, true);
}

describe("fit-landmark _commands hidden verb", () => {
  test("node bin _commands exits 0 with no env/config (verb above libconfig load)", () => {
    const cwd = mkdtempSync(resolve(tmpdir(), "landmark-_commands-"));
    try {
      const res = spawnSync("node", [BIN, "_commands"], {
        env: { PATH: process.env.PATH },
        encoding: "utf8",
        cwd,
      });
      assert.equal(
        res.status,
        0,
        `_commands exited ${res.status}: ${res.stderr}`,
      );
      assertManifestShape(res.stdout);
    } finally {
      try {
        rmSync(cwd, { recursive: true });
      } catch {
        // ignore
      }
    }
  });

  test("bunx fit-landmark _commands resolves via the workspace (smoke spawn path)", () => {
    // Run from the test file's directory so bunx walks up to the
    // workspace node_modules/.bin and finds fit-landmark — exactly the
    // path substrate-smoke takes when it spawns from the CI checkout.
    const res = spawnSync("bunx", ["fit-landmark", "_commands"], {
      encoding: "utf8",
      cwd: __dirname,
    });
    assert.equal(
      res.status,
      0,
      `bunx _commands exited ${res.status}: ${res.stderr}`,
    );
    assertManifestShape(res.stdout);
  });
});
