/**
 * Posture CLI behaviour, end to end. `run()` derives `OUTPOST_HOME` from
 * `homedir()`, which Node resolves from `$HOME` at process startup (and caches),
 * so the only portable way to point it at a sandbox is to spawn the bin with
 * `HOME` set in the child's env. This covers `init`'s default recording, the
 * `posture` set/show affordance, and `status` observability of the recorded
 * posture — none of which `outpost-cli.test.js` (parser-only) can reach.
 *
 * Subprocess use is intentional and confined to this `*.integration.test.js`
 * file (whole-file exempt from check-subprocess-in-tests).
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/fit-outpost.js", import.meta.url));

/** Run the bin with `$HOME` pointed at the sandbox. */
function runCli(argv, home) {
  return spawnSync("node", [BIN, ...argv], {
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
}

describe("fit-outpost posture CLI (subprocess integration)", () => {
  let home;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "outpost-posture-"));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  /** The `posture:` line from a `status` invocation. */
  function postureLine(home) {
    const r = runCli(["status"], home);
    return r.stdout.split("\n").find((l) => l.startsWith("posture:"));
  }

  test("status before any record shows posture: unset", () => {
    assert.match(postureLine(home), /^posture: unset$/);
  });

  test("init records the default brief posture", () => {
    const r = runCli(["init", "team"], home);
    assert.strictEqual(r.status, 0, r.stderr);
    const record = JSON.parse(
      readFileSync(join(home, ".fit", "outpost", "posture.json"), "utf8"),
    );
    assert.strictEqual(record.posture, "brief");
    assert.match(postureLine(home), /^posture: brief$/);
  });

  test("posture <value> records and round-trips via status", () => {
    const r = runCli(["posture", "brief+draft"], home);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(postureLine(home), /^posture: brief\+draft$/);
  });

  test("an unknown posture argument exits 2", () => {
    const r = runCli(["posture", "bogus"], home);
    assert.strictEqual(r.status, 2);
  });
});
