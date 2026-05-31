import { describe, test } from "node:test";
import assert from "node:assert";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { createApmInstaller } from "../src/benchmark/apm-installer.js";
import { loadTaskFamily } from "../src/benchmark/task-family.js";
import { createWorkdirManager } from "../src/benchmark/workdir.js";
import { realRuntimeWithSubprocess } from "./real-runtime.js";

// Integration: WorkdirManager spawns real detached process groups and binds
// real TCP ports through the production runtime. This case spawns a real
// `node` listener subprocess to verify the SIGTERM/SIGKILL teardown actually
// reaps it, so it stays an integration test. The apm installer keeps a fake
// subprocess so the suite never shells out to a real `apm`.

const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

const RT = createDefaultRuntime();

function newInstaller() {
  return createApmInstaller({ runtime: realRuntimeWithSubprocess() });
}

describe("WorkdirManager.teardown", () => {
  test("frees the port and reaps the process group after a background listener", async () => {
    // Synthesize a task whose preflight starts a background HTTP listener
    // on $PORT and then exits 0 itself. The listener lives in the same
    // process group; teardown should SIGTERM/SIGKILL it.
    const family = await loadTaskFamily(FIXTURE, RT);
    const out = await mkdtemp(join(tmpdir(), "benchmark-wm-listener-"));
    const { stagingDir } = await newInstaller().install(family, out);
    const wm = createWorkdirManager({
      stagingDir,
      runOutputDir: out,
      termGraceMs: 200,
      runtime: RT,
    });
    const taskRoot = await mkdtemp(join(tmpdir(), "benchmark-listener-task-"));
    await mkdir(join(taskRoot, "hooks"), { recursive: true });
    await mkdir(join(taskRoot, "workdir"), { recursive: true });
    await mkdir(join(taskRoot, "specs"), { recursive: true });
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
    await writeFile(join(taskRoot, "hooks", "preflight.sh"), preflight);
    await chmod(join(taskRoot, "hooks", "preflight.sh"), 0o755);
    await writeFile(join(taskRoot, "agent.task.md"), "x");
    await writeFile(join(taskRoot, "supervisor.task.md"), "x");
    await writeFile(join(taskRoot, "judge.task.md"), "x");

    const task = {
      id: "listener",
      paths: {
        taskDir: taskRoot,
        instructions: join(taskRoot, "agent.task.md"),
        supervisor: null,
        judge: null,
        hooks: join(taskRoot, "hooks"),
        preflight: join(taskRoot, "hooks", "preflight.sh"),
        invariants: null,
        specs: join(taskRoot, "specs"),
        workdir: join(taskRoot, "workdir"),
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
