import { describe, test } from "node:test";
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runHiddenTests } from "../src/benchmark/hidden-tests.js";
import { realRuntimeWithSubprocess } from "./real-runtime.js";

function streamOf(str) {
  return {
    async *[Symbol.asyncIterator]() {
      if (str) yield str;
    },
  };
}

function childOf({ exitCode = 0, stderr = "" } = {}) {
  return {
    stdout: streamOf(),
    stderr: streamOf(stderr),
    exitCode: Promise.resolve(exitCode),
    kill: () => {},
    pid: 1,
  };
}

/**
 * A scripted `spawn`: `script(cmd, args, opts)` returns the child for each
 * call; every call is recorded on `.calls`.
 */
function scriptedSubprocess(script) {
  const calls = [];
  return {
    calls,
    spawn: (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      return script(cmd, args, opts);
    },
    run: async () => ({ stdout: "", stderr: "", exitCode: 0, signal: null }),
    runSync: () => ({ stdout: "", stderr: "", exitCode: 0, signal: null }),
  };
}

async function makeDirs() {
  const root = await mkdtemp(join(tmpdir(), "hidden-tests-"));
  const cwd = join(root, "cwd");
  const testsRoot = join(root, "tests");
  await mkdir(cwd, { recursive: true });
  await mkdir(testsRoot, { recursive: true });
  return { root, cwd, testsRoot };
}

async function writeSuiteFile(testsRoot, stagePath, content) {
  const path = join(testsRoot, stagePath);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
  return { sourcePath: path, stagePath };
}

function makeTask(testsRoot, checks, support = []) {
  return {
    id: "t1",
    paths: {
      taskDir: "/family/tasks/t1",
      hooks: "/family/tasks/t1/hooks",
      tests: testsRoot,
    },
    tests: { checks, support },
  };
}

function ctxFor(cwd) {
  return { cwd, port: 4321, runDir: cwd, familyDir: null };
}

describe("runHiddenTests", () => {
  test("suite-less task yields empty details without touching subprocess", async () => {
    const sub = scriptedSubprocess(() => childOf());
    const runtime = realRuntimeWithSubprocess(sub);
    const result = await runHiddenTests(
      { id: "t", paths: {}, tests: null },
      ctxFor("/nowhere"),
      runtime,
    );
    assert.deepStrictEqual(result, { details: [] });
    assert.strictEqual(sub.calls.length, 0);
  });

  test("one row per check, gate from the filename, run from the agent CWD", async () => {
    const { cwd, testsRoot } = await makeDirs();
    const gate = await writeSuiteFile(
      testsRoot,
      "app/test/todo.gate.test.js",
      "// gate",
    );
    const scored = await writeSuiteFile(
      testsRoot,
      "app/test/filter.test.js",
      "// scored",
    );
    const task = makeTask(testsRoot, [
      { name: "filter", gate: false, ...scored },
      { name: "todo", gate: true, ...gate },
    ]);
    const sub = scriptedSubprocess((_cmd, args) =>
      childOf({ exitCode: args[1].includes("filter") ? 1 : 0 }),
    );
    const runtime = realRuntimeWithSubprocess(sub);

    const { details } = await runHiddenTests(task, ctxFor(cwd), runtime);
    assert.strictEqual(details.length, 2);
    assert.deepStrictEqual(details[0], {
      test: "filter",
      pass: false,
      message: "exit 1",
    });
    assert.deepStrictEqual(details[1], {
      test: "todo",
      pass: true,
      gate: true,
    });
    for (const call of sub.calls) {
      assert.strictEqual(call.cmd, "node");
      assert.strictEqual(call.args[0], "--test");
      assert.strictEqual(call.opts.cwd, cwd);
      assert.strictEqual(call.opts.env.AGENT_CWD, cwd);
      assert.strictEqual(call.opts.env.TASK_ID, "t1");
      // An inherited NODE_TEST_CONTEXT would make a failing child `node
      // --test` exit 0 — the engine must never pass it through.
      assert.ok(!("NODE_TEST_CONTEXT" in call.opts.env));
    }
  });

  test("a failing check's message carries the stderr tail", async () => {
    const { cwd, testsRoot } = await makeDirs();
    const check = await writeSuiteFile(testsRoot, "x.test.js", "// check");
    const task = makeTask(testsRoot, [{ name: "x", gate: false, ...check }]);
    const sub = scriptedSubprocess(() =>
      childOf({ exitCode: 1, stderr: "  AssertionError: boom  \n" }),
    );
    const runtime = realRuntimeWithSubprocess(sub);

    const { details } = await runHiddenTests(task, ctxFor(cwd), runtime);
    assert.deepStrictEqual(details[0], {
      test: "x",
      pass: false,
      message: "exit 1: AssertionError: boom",
    });
  });

  test("a deleted scaffold becomes a failing row, never a throw", async () => {
    const { cwd, testsRoot } = await makeDirs();
    const check = await writeSuiteFile(testsRoot, "app/x.test.js", "// check");
    // The agent replaced the app/ directory with a file: staging cannot
    // create the parent directory.
    await writeFile(join(cwd, "app"), "not a directory");
    const task = makeTask(testsRoot, [{ name: "x", gate: false, ...check }]);
    const sub = scriptedSubprocess(() => childOf());
    const runtime = realRuntimeWithSubprocess(sub);

    const { details } = await runHiddenTests(task, ctxFor(cwd), runtime);
    assert.strictEqual(details[0].test, "x");
    assert.strictEqual(details[0].pass, false);
    assert.match(details[0].message, /^stage failed: /);
    assert.strictEqual(sub.calls.length, 0);
  });

  test("restores the tree: collided bytes back, staged files gone, created dirs removed", async () => {
    const { cwd, testsRoot } = await makeDirs();
    await mkdir(join(cwd, "app/test"), { recursive: true });
    const original = "agent's own suite\n";
    await writeFile(join(cwd, "app/test/todo.test.js"), original);

    const collide = await writeSuiteFile(
      testsRoot,
      "app/test/todo.test.js",
      "harness gate copy\n",
    );
    const fresh = await writeSuiteFile(
      testsRoot,
      "graders/deep/extra.test.js",
      "// staged into a new dir",
    );
    const task = makeTask(testsRoot, [
      { name: "todo", gate: true, ...collide },
      { name: "extra", gate: false, ...fresh },
    ]);
    const staged = [];
    const sub = scriptedSubprocess((_cmd, args, opts) => {
      staged.push(readFileSync(join(opts.cwd, args[1]), "utf8"));
      return childOf();
    });
    const runtime = realRuntimeWithSubprocess(sub);

    await runHiddenTests(task, ctxFor(cwd), runtime);
    // During the run each check saw its harness copy.
    assert.deepStrictEqual(staged, [
      "harness gate copy\n",
      "// staged into a new dir",
    ]);
    // After the run the agent's tree is back, byte-identical.
    assert.strictEqual(
      readFileSync(join(cwd, "app/test/todo.test.js"), "utf8"),
      original,
    );
    assert.strictEqual(existsSync(join(cwd, "graders")), false);
  });

  test("support files are staged for the whole pass and gone after", async () => {
    const { cwd, testsRoot } = await makeDirs();
    const check = await writeSuiteFile(testsRoot, "app/x.test.js", "// check");
    const helper = await writeSuiteFile(
      testsRoot,
      "app/helpers.js",
      "// support",
    );
    const task = makeTask(
      testsRoot,
      [{ name: "x", gate: false, ...check }],
      [helper],
    );
    let sawSupport = false;
    const sub = scriptedSubprocess((_cmd, _args, opts) => {
      sawSupport = existsSync(join(opts.cwd, "app/helpers.js"));
      return childOf();
    });
    const runtime = realRuntimeWithSubprocess(sub);

    await runHiddenTests(task, ctxFor(cwd), runtime);
    assert.strictEqual(sawSupport, true);
    assert.strictEqual(existsSync(join(cwd, "app/helpers.js")), false);
    assert.strictEqual(existsSync(join(cwd, "app/x.test.js")), false);
  });

  test("a hung check is SIGKILLed and fails with a timeout message", async () => {
    const { cwd, testsRoot } = await makeDirs();
    const check = await writeSuiteFile(testsRoot, "slow.test.js", "// hang");
    const task = makeTask(testsRoot, [{ name: "slow", gate: false, ...check }]);
    const kills = [];
    const sub = scriptedSubprocess(() => {
      let resolveExit;
      return {
        stdout: streamOf(),
        stderr: streamOf(),
        exitCode: new Promise((r) => {
          resolveExit = r;
        }),
        kill: (signal) => {
          kills.push(signal);
          resolveExit(137);
        },
        pid: 1,
      };
    });
    const runtime = realRuntimeWithSubprocess(sub);

    const { details } = await runHiddenTests(task, ctxFor(cwd), runtime, {
      timeoutMs: 25,
    });
    assert.deepStrictEqual(kills, ["SIGKILL"]);
    assert.deepStrictEqual(details[0], {
      test: "slow",
      pass: false,
      message: "timed out after 25ms",
    });
    assert.strictEqual(existsSync(join(cwd, "slow.test.js")), false);
  });
});
