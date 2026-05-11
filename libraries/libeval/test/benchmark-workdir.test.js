import { describe, test } from "node:test";
import assert from "node:assert";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installApm } from "../src/benchmark/apm-installer.js";
import { loadTaskFamily } from "../src/benchmark/task-family.js";
import { createWorkdirManager } from "../src/benchmark/workdir.js";

const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

async function setupManager() {
  const family = await loadTaskFamily(FIXTURE);
  const out = await mkdtemp(join(tmpdir(), "benchmark-wm-"));
  const { stagingDir } = await installApm(family, out);
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
  test("seeds the agent CWD with workdir + specs + staged .claude/ but never scoring/", async () => {
    const { family, wm } = await setupManager();
    const task = family.tasks().find((t) => t.id === "tf/pass");
    const wd = await wm.start(task, 0);
    assert.ok(wd.cwd.endsWith("tf__pass/0/cwd"));
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
    // scoring/ MUST NOT exist in the agent CWD
    await assert.rejects(
      import("node:fs").then((m) =>
        m.promises.access(join(wd.cwd, "scoring", "run.sh")),
      ),
    );
    // scripts/ is excluded from the copy too — preflight lives in the template
    await assert.rejects(
      import("node:fs").then((m) =>
        m.promises.access(join(wd.cwd, "scripts", "preflight.sh")),
      ),
    );
    await wm.teardown(wd);
  });

  test("populates preflightError without throwing when preflight exits non-zero", async () => {
    const { family, wm } = await setupManager();
    const task = family.tasks().find((t) => t.id === "tf/preflight-broken");
    const wd = await wm.start(task, 0);
    assert.ok(wd.preflightError, "expected preflightError");
    assert.strictEqual(wd.preflightError.phase, "preflight");
    assert.strictEqual(wd.preflightError.exitCode, 7);
    await wm.teardown(wd);
  });
});

describe("WorkdirManager.teardown", () => {
  test("frees the port and reaps the process group after a background listener", async () => {
    // Synthesize a task whose preflight starts a background HTTP listener
    // on $PORT and then exits 0 itself. The listener lives in the same
    // process group; teardown should SIGTERM/SIGKILL it.
    const family = await loadTaskFamily(FIXTURE);
    const out = await mkdtemp(join(tmpdir(), "benchmark-wm-listener-"));
    const { stagingDir } = await installApm(family, out);
    const wm = createWorkdirManager({
      stagingDir,
      runOutputDir: out,
      termGraceMs: 200,
    });
    const taskRoot = await mkdtemp(join(tmpdir(), "benchmark-listener-task-"));
    await mkdir(join(taskRoot, "workdir", "scripts"), { recursive: true });
    await mkdir(join(taskRoot, "specs"), { recursive: true });
    await mkdir(join(taskRoot, "scoring"), { recursive: true });
    const listener = `#!/usr/bin/env node
const http = require("node:http");
const server = http.createServer((_, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end('{"ok":true}');
});
server.listen(Number(process.env.PORT), "127.0.0.1");
// Keep alive — teardown is responsible for killing this.
setInterval(() => {}, 1000);
`;
    await writeFile(join(taskRoot, "workdir", "listener.js"), listener);
    const preflight = `#!/bin/sh
node "$WORKDIR/listener.js" >/dev/null 2>&1 &
# Give the listener a moment to bind before we exit.
sleep 0.2
exit 0
`;
    await writeFile(
      join(taskRoot, "workdir", "scripts", "preflight.sh"),
      preflight,
    );
    await chmod(join(taskRoot, "workdir", "scripts", "preflight.sh"), 0o755);
    await writeFile(join(taskRoot, "instructions.md"), "x");
    await writeFile(join(taskRoot, "supervisor.task.md"), "x");
    await writeFile(join(taskRoot, "judge.task.md"), "x");

    const task = {
      id: "tf/listener",
      paths: {
        instructions: join(taskRoot, "instructions.md"),
        supervisor: join(taskRoot, "supervisor.task.md"),
        judge: join(taskRoot, "judge.task.md"),
        specs: join(taskRoot, "specs"),
        workdir: join(taskRoot, "workdir"),
        scoring: join(taskRoot, "scoring"),
      },
    };

    const wd = await wm.start(task, 0);
    assert.ok(!wd.preflightError, "listener fixture preflight should pass");
    // The listener must actually be on the port — verify it boots.
    const reachable = await new Promise((res) => {
      const s = connect({ port: wd.port, host: "127.0.0.1" }, () => {
        s.destroy();
        res(true);
      });
      s.on("error", () => res(false));
      s.setTimeout(1000, () => {
        s.destroy();
        res(false);
      });
    });
    assert.strictEqual(reachable, true, "listener should bind to $PORT");

    const { portFree, descendants } = await wm.teardown(wd);
    assert.strictEqual(portFree, true);
    assert.strictEqual(descendants, 0);
  });
});
