import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTaskFamily } from "../src/benchmark/task-family.js";
import { installApm } from "../src/benchmark/apm-installer.js";
import { WorkdirManager } from "../src/benchmark/workdir.js";
import { materialiseBenchmarkFamily } from "./benchmark-fixture.js";

async function setupManager() {
  const { root } = await materialiseBenchmarkFamily();
  const family = await loadTaskFamily(root);
  const runOutputDir = mkdtempSync(join(tmpdir(), "fb-run-"));
  const { stagingDir } = await installApm(family, runOutputDir);
  const wm = new WorkdirManager({ stagingDir, runOutputDir });
  return { family, wm };
}

function findTask(family, id) {
  for (const task of family.tasks()) {
    if (task.id === id) return task;
  }
  throw new Error(`task ${id} not found`);
}

describe("WorkdirManager.start", () => {
  test("never copies scoring/ into the agent CWD (sentinel-filename probe)", async () => {
    const { family, wm } = await setupManager();
    const task = findTask(family, "tf/pass");
    const wd = await wm.start(task, 0);
    assert.strictEqual(existsSync(join(wd.cwd, "scoring")), false);
    assert.strictEqual(existsSync(join(wd.cwd, "sentinel.txt")), false);
    await wm.teardown(wd);
  });

  test("excludes workdir/scripts/ from the agent CWD", async () => {
    const { family, wm } = await setupManager();
    const task = findTask(family, "tf/pass");
    const wd = await wm.start(task, 0);
    assert.strictEqual(existsSync(join(wd.cwd, "scripts")), false);
    await wm.teardown(wd);
  });

  test("overlays apm staging .claude/ into the agent CWD", async () => {
    const { family, wm } = await setupManager();
    const task = findTask(family, "tf/pass");
    const wd = await wm.start(task, 0);
    assert.ok(
      existsSync(join(wd.cwd, ".claude", "skills", "noop", "SKILL.md")),
    );
    await wm.teardown(wd);
  });

  test("allocates a free TCP port (non-zero integer)", async () => {
    const { family, wm } = await setupManager();
    const task = findTask(family, "tf/pass");
    const wd = await wm.start(task, 0);
    assert.ok(Number.isInteger(wd.port));
    assert.ok(wd.port > 0);
    await wm.teardown(wd);
  });

  test("traces are siblings of cwd at runDir/agent.ndjson and runDir/judge.ndjson", async () => {
    const { family, wm } = await setupManager();
    const task = findTask(family, "tf/pass");
    const wd = await wm.start(task, 0);
    assert.ok(wd.agentTracePath.endsWith("/agent.ndjson"));
    assert.ok(wd.judgeTracePath.endsWith("/judge.ndjson"));
    assert.ok(wd.runDir);
    assert.strictEqual(wd.runDir, join(wd.runDir));
    await wm.teardown(wd);
  });

  test("populates preflightError when the preflight script exits non-zero", async () => {
    const { family, wm } = await setupManager();
    const task = findTask(family, "tf/preflight-broken");
    const wd = await wm.start(task, 0);
    assert.ok(wd.preflightError);
    assert.strictEqual(wd.preflightError.phase, "preflight");
    assert.notStrictEqual(wd.preflightError.exitCode, 0);
    await wm.teardown(wd);
  });
});

describe("WorkdirManager.teardown", () => {
  test("returns portFree === true after a successful preflight", async () => {
    const { family, wm } = await setupManager();
    const task = findTask(family, "tf/pass");
    const wd = await wm.start(task, 0);
    const result = await wm.teardown(wd);
    assert.strictEqual(result.portFree, true);
    assert.strictEqual(typeof result.descendants, "number");
  });

  test("tolerates missing pgid (preflight spawn failure)", async () => {
    const { wm } = await setupManager();
    const fakeWd = {
      cwd: "/tmp/x",
      port: 65432,
      pgid: null,
      scaffold: null,
      agentTracePath: "/tmp/a.ndjson",
      judgeTracePath: "/tmp/j.ndjson",
      runDir: "/tmp",
    };
    const result = await wm.teardown(fakeWd);
    assert.strictEqual(result.portFree, true);
    assert.strictEqual(result.descendants, 0);
  });
});

describe("WorkdirManager constructor", () => {
  test("requires stagingDir", () => {
    assert.throws(
      () => new WorkdirManager({ runOutputDir: "/tmp/x" }),
      /stagingDir/,
    );
  });

  test("requires runOutputDir", () => {
    assert.throws(
      () => new WorkdirManager({ stagingDir: "/tmp/x" }),
      /runOutputDir/,
    );
  });
});

describe("WorkdirManager preflight env", () => {
  test("preflight sees WORKDIR and PORT env vars", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const probeScript = `#!/usr/bin/env bash
[ -n "$WORKDIR" ] || exit 11
[ -n "$PORT" ] || exit 12
echo "$WORKDIR" > "$WORKDIR/preflight-saw-workdir.txt"
exit 0
`;
    writeFileSync(
      join(root, "tasks", "tf", "pass", "workdir", "scripts", "preflight.sh"),
      probeScript,
    );
    const family = await loadTaskFamily(root);
    const runOutputDir = mkdtempSync(join(tmpdir(), "fb-run-"));
    const { stagingDir } = await installApm(family, runOutputDir);
    const wm = new WorkdirManager({ stagingDir, runOutputDir });
    const task = findTask(family, "tf/pass");
    const wd = await wm.start(task, 0);
    assert.ok(
      !wd.preflightError,
      `preflight failed: ${JSON.stringify(wd.preflightError)}`,
    );
    assert.ok(existsSync(join(wd.cwd, "preflight-saw-workdir.txt")));
    await wm.teardown(wd);
  });
});
