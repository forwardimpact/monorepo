import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { createApmInstaller } from "../src/benchmark/apm-installer.js";
import { loadTaskFamily } from "../src/benchmark/task-family.js";
import { createWorkdirManager } from "../src/benchmark/workdir.js";
import { realRuntimeWithSubprocess } from "./real-runtime.js";

const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

// WorkdirManager spawns real preflight scripts and binds real TCP ports, so it
// gets the production runtime; the apm installer keeps a fake subprocess so the
// suite never shells out to a real `apm`.
const RT = createDefaultRuntime();
const INSTALLER_RT = realRuntimeWithSubprocess();

function newInstaller() {
  return createApmInstaller({ runtime: INSTALLER_RT });
}

async function setupManager() {
  const family = await loadTaskFamily(FIXTURE, RT);
  const out = await mkdtemp(join(tmpdir(), "benchmark-wm-"));
  const { stagingDir } = await newInstaller().install(family, out);
  return {
    family,
    out,
    wm: createWorkdirManager({
      stagingDir,
      runOutputDir: out,
      termGraceMs: 200,
      runtime: RT,
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
        m.promises.access(join(wd.cwd, "hooks", "invariants.sh")),
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
