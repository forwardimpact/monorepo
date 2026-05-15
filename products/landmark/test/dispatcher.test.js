/**
 * Dispatcher exit-code test (spec 840 criterion 3b).
 *
 * Spawns the bin/fit-landmark.js entrypoint via `node` with a controlled
 * env and asserts the documented exit codes:
 *   - 4: IdentityUnresolvedError (no LANDMARK_AUTH_TOKEN)
 *   - 3: SupabaseUnavailableError (token present but no MAP_SUPABASE_*)
 *   - 0: marker (needsSupabase: false, dispatcher skips identity)
 *
 * The "no Supabase query before error" half of criterion 3b is enforced
 * structurally — resolveIdentity runs before buildContext, which is the
 * only construction site for the Supabase client.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { signTestToken } from "./lib/sign-test-token.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(__dirname, "..", "bin", "fit-landmark.js");
// products/landmark/test -> three levels up = repo root.
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const DATA_DIR = resolve(REPO_ROOT, "products", "map", "starter");

function run(args, env) {
  // Pin to `node` rather than `process.execPath` so the dispatcher's exit-code
  // contract is tested under the same runtime external users invoke it with.
  return spawnSync("node", [BIN, ...args], {
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
  });
}

describe("fit-landmark dispatcher exit codes", () => {
  test("exits 4 when no identity can be resolved on a Supabase-using command", () => {
    const res = run(["voice", "--email", "a@b.example", "--data", DATA_DIR], {
      // Point the credentials store at a guaranteed-absent file so the
      // store fallback does not pick up a real engineer's session.
      LANDMARK_CREDENTIALS_FILE: "/nonexistent/landmark-creds.json",
    });
    assert.equal(res.status, 4);
    assert.match(res.stderr, /Authentication required/);
    assert.match(res.stderr, /fit-landmark login/);
  });

  test("exits 3 when token present but MAP_SUPABASE_URL is unset", () => {
    const token = signTestToken({
      email: "alice@example.com",
      secret: "dispatcher-test-secret",
    });
    const res = run(
      ["voice", "--email", "alice@example.com", "--data", DATA_DIR],
      {
        LANDMARK_AUTH_TOKEN: token,
        // Important: do not set MAP_SUPABASE_URL or MAP_SUPABASE_ANON_KEY.
      },
    );
    assert.equal(res.status, 3);
    assert.match(res.stderr, /MAP_SUPABASE_URL/);
  });

  test("marker does not need Supabase and skips identity resolution", () => {
    const res = run(["marker", "task_completion", "--data", DATA_DIR], {});
    // marker may exit 0 (found) or 1 (not found in current dataset) but
    // must never exit 3 or 4 — those are the dispatcher-error codes the
    // chokepoint reserves for needsSupabase: true commands.
    assert.ok(
      res.status === 0 || res.status === 1,
      `marker exit was ${res.status}; stderr: ${res.stderr}`,
    );
    assert.doesNotMatch(res.stderr, /Authentication required/);
  });
});
