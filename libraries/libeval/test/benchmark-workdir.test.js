import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApmInstaller } from "../src/benchmark/apm-installer.js";
import { loadTaskFamily } from "../src/benchmark/task-family.js";
import { createWorkdirManager } from "../src/benchmark/workdir.js";
import { makeFakeApmSpawn } from "./mock-apm-spawn.js";

const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

function newInstaller() {
  return createApmInstaller({ spawn: makeFakeApmSpawn() });
}

async function setupManager() {
  const family = await loadTaskFamily(FIXTURE);
  const out = await mkdtemp(join(tmpdir(), "benchmark-wm-"));
  const { stagingDir } = await newInstaller().install(family, out);
  return {
    family,
    out,
    wm: createWorkdirManager({
      stagingDir,
      runOutputDir: out,
      termGraceMs: 200,
    }),
  };
}

describe("WorkdirManager.start", () => {
  test("seeds the agent CWD with workdir + specs + staged .claude/ but never hooks/", async () => {
    const { family, wm } = await setupManager();
    const task = family.tasks().find((t) => t.id === "pass");
    const wd = await wm.start(task, 0);
    assert.ok(wd.cwd.endsWith("pass/0/cwd"));
    assert.ok(!wd.preflightError, "preflight should pass on tf/pass");
    // README copied from workdir/
    await assert.doesNotReject(
      import("node:fs").then((m) =>
        m.promises.access(join(wd.cwd, "README.md")),
      ),
    );
    // spec copied from specs/
    await assert.doesNotReject(
      import("node:fs").then((m) =>
        m.promises.access(join(wd.cwd, "specs", "spec.md")),
      ),
    );
    // .claude/skills copied from staging
    await assert.doesNotReject(
      import("node:fs").then((m) =>
        m.promises.access(
          join(wd.cwd, ".claude", "skills", "noop", "SKILL.md"),
        ),
      ),
    );
    // hooks/ MUST NOT exist in the agent CWD
    await assert.rejects(
      import("node:fs").then((m) =>
        m.promises.access(join(wd.cwd, "hooks", "score.sh")),
      ),
    );
    await wm.teardown(wd);
  });

  test("populates preflightError without throwing when preflight exits non-zero", async () => {
    const { family, wm } = await setupManager();
    const task = family.tasks().find((t) => t.id === "preflight-broken");
    const wd = await wm.start(task, 0);
    assert.ok(wd.preflightError, "expected preflightError");
    assert.strictEqual(wd.preflightError.phase, "preflight");
    assert.strictEqual(wd.preflightError.exitCode, 7);
    await wm.teardown(wd);
  });
});

// The teardown listener-cleanup test spawns a real `node` subprocess and binds
// a real TCP port; it lives in benchmark-workdir.integration.test.js.
