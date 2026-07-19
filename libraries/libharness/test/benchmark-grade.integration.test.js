import { describe, test } from "node:test";
import assert from "node:assert";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { runInvariants } from "../src/benchmark/invariants.js";
import { runBenchmarkGradeCommand } from "../src/commands/benchmark-grade.js";

const RT = createDefaultRuntime();

async function buildStubTask(invariantsShContent) {
  const root = await mkdtemp(join(tmpdir(), "benchmark-invariants-"));
  await mkdir(join(root, "hooks"), { recursive: true });
  await writeFile(join(root, "hooks", "invariants.sh"), invariantsShContent);
  await chmod(join(root, "hooks", "invariants.sh"), 0o755);
  const runDir = await mkdtemp(join(tmpdir(), "benchmark-invariants-run-"));
  const cwd = join(runDir, "cwd");
  await mkdir(cwd, { recursive: true });
  return {
    task: {
      id: "invariants",
      paths: {
        taskDir: root,
        instructions: "",
        supervisor: null,
        judge: null,
        hooks: join(root, "hooks"),
        invariants: join(root, "hooks", "invariants.sh"),
        preflight: null,
        specs: "",
        workdir: "",
      },
    },
    ctx: { cwd, port: 0, runDir },
  };
}

describe("runInvariants", () => {
  test("exit 0 with parsed details and no verdict of its own", async () => {
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
printf '%s\n' '{"test":"t1","pass":true}' >&"$RESULTS_FD"
printf '%s\n' '{"test":"t2","pass":true,"message":"ok"}' >&"$RESULTS_FD"
exit 0
`,
    );
    const out = await runInvariants(task, ctx, RT);
    assert.strictEqual(out.exitCode, 0);
    assert.ok(!("verdict" in out), "collector carries no verdict");
    assert.strictEqual(out.details.length, 2);
    assert.deepStrictEqual(out.details[0], { test: "t1", pass: true });
  });

  test("non-zero exit surfaces the exit code (script health)", async () => {
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
exit 3
`,
    );
    const out = await runInvariants(task, ctx, RT);
    assert.strictEqual(out.exitCode, 3);
    assert.strictEqual(out.details.length, 0);
  });

  test("script stderr is surfaced so a hook failure reads distinctly", async () => {
    // A failing hook tool (here a command that does not exist) writes to
    // stderr and exits non-zero while emitting no fd-3 rows — the signature of
    // a harness problem, not a real invariant miss. The stderr must survive.
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
this-tool-does-not-exist assert --exists /nope
exit 1
`,
    );
    const out = await runInvariants(task, ctx, RT);
    assert.strictEqual(out.exitCode, 1);
    assert.strictEqual(out.details.length, 0);
    assert.match(out.stderr, /not found/i);
  });

  test("a clean run carries no stderr field", async () => {
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
printf '%s\\n' '{"test":"t","pass":true}' >&"$RESULTS_FD"
exit 0
`,
    );
    const out = await runInvariants(task, ctx, RT);
    assert.strictEqual(out.exitCode, 0);
    assert.ok(!("stderr" in out), "clean run should omit stderr");
  });

  test("malformed fd-3 lines survive as raw rows with parseError", async () => {
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
printf '%s\n' 'not json' >&"$RESULTS_FD"
printf '%s\n' '{"test":"t1","pass":true}' >&"$RESULTS_FD"
exit 0
`,
    );
    const out = await runInvariants(task, ctx, RT);
    assert.strictEqual(out.exitCode, 0);
    assert.strictEqual(out.details.length, 2);
    assert.deepStrictEqual(out.details[0], {
      raw: "not json",
      parseError: true,
    });
    assert.deepStrictEqual(out.details[1], { test: "t1", pass: true });
  });

  test("AGENT_CWD, PORT, RESULTS_FD env vars reach the script", async () => {
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
printf '%s\n' "{\\"cwd\\":\\"$AGENT_CWD\\",\\"port\\":$PORT,\\"fd\\":$RESULTS_FD,\\"pass\\":true}" >&"$RESULTS_FD"
exit 0
`,
    );
    ctx.port = 12345;
    const out = await runInvariants(task, ctx, RT);
    assert.strictEqual(out.details[0].cwd, ctx.cwd);
    assert.strictEqual(out.details[0].port, 12345);
    assert.strictEqual(out.details[0].fd, 3);
  });

  test("TASK_ID, TASK_DIR, HOOKS_DIR, FAMILY_DIR reach the script", async () => {
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
printf '%s\\n' "{\\"taskId\\":\\"$TASK_ID\\",\\"taskDir\\":\\"$TASK_DIR\\",\\"hooksDir\\":\\"$HOOKS_DIR\\",\\"familyDir\\":\\"$FAMILY_DIR\\",\\"pass\\":true}" >&"$RESULTS_FD"
exit 0
`,
    );
    ctx.familyDir = "/family/root";
    const out = await runInvariants(task, ctx, RT);
    assert.strictEqual(out.details[0].taskId, "invariants");
    assert.strictEqual(out.details[0].taskDir, task.paths.taskDir);
    assert.strictEqual(out.details[0].hooksDir, task.paths.hooks);
    assert.strictEqual(out.details[0].familyDir, "/family/root");
  });
});

/**
 * A check file body: passes iff `<marker>` exists in the agent CWD.
 * @param {string} marker
 */
function checkFile(marker) {
  return `const test = require("node:test");
const { accessSync } = require("node:fs");
test("${marker} present", () => {
  accessSync("${marker}");
});
`;
}

const GATE_ONLY_HOOK = `#!/bin/sh
printf '%s\n' '{"test":"scaffold","pass":true,"gate":true}' >&"$RESULTS_FD"
exit 0
`;

/**
 * Build an on-disk family with one `todo` task: an invariants gate hook and
 * (optionally) a two-check hidden `tests/` overlay graded by real
 * `node --test` runs.
 */
async function buildGradeFamily({ hook = GATE_ONLY_HOOK, withSuite = true }) {
  const family = await mkdtemp(join(tmpdir(), "benchmark-grade-family-"));
  const taskDir = join(family, "tasks", "todo");
  await mkdir(join(taskDir, "hooks"), { recursive: true });
  await writeFile(join(taskDir, "agent.task.md"), "do the task\n");
  await writeFile(join(taskDir, "hooks", "invariants.sh"), hook);
  await chmod(join(taskDir, "hooks", "invariants.sh"), 0o755);
  if (withSuite) {
    await mkdir(join(taskDir, "tests"), { recursive: true });
    await writeFile(join(taskDir, "tests", "a.test.js"), checkFile("done-a"));
    await writeFile(join(taskDir, "tests", "b.test.js"), checkFile("done-b"));
  }
  return family;
}

/** A run-dir whose cwd/ contains the given marker files. */
async function buildRunDir(markers) {
  const runDir = await mkdtemp(join(tmpdir(), "benchmark-grade-run-"));
  const cwd = join(runDir, "cwd");
  await mkdir(cwd, { recursive: true });
  for (const marker of markers) await writeFile(join(cwd, marker), "done\n");
  return runDir;
}

async function grade(family, runDir) {
  const output = join(
    await mkdtemp(join(tmpdir(), "benchmark-grade-out-")),
    "record.jsonl",
  );
  const result = await runBenchmarkGradeCommand({
    options: { family, task: "todo", "run-dir": runDir, output },
    args: {},
    deps: { runtime: RT },
  });
  const record = JSON.parse(await readFile(output, "utf8"));
  return { result, record };
}

describe("runBenchmarkGradeCommand", () => {
  test("partial scored completion → fractional score, ok: false", async () => {
    const family = await buildGradeFamily({});
    const runDir = await buildRunDir(["done-a"]);
    const { result, record } = await grade(family, runDir);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(record.grade.verdict, "fail");
    assert.strictEqual(record.grade.score, 0.5);
    assert.strictEqual(record.grade.gatesPass, true);
    assert.strictEqual(record.exitCode, 0);
    assert.strictEqual(record.hiddenTests.details.length, 2);
  });

  test("full marks → ok: true, score 1", async () => {
    const family = await buildGradeFamily({});
    const runDir = await buildRunDir(["done-a", "done-b"]);
    const { result, record } = await grade(family, runDir);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(record.grade.verdict, "pass");
    assert.strictEqual(record.grade.score, 1);
  });

  test("passing rows + invariants exit 1 → score 0, ok: false", async () => {
    const family = await buildGradeFamily({
      hook: `#!/bin/sh
printf '%s\n' '{"test":"scaffold","pass":true,"gate":true}' >&"$RESULTS_FD"
exit 1
`,
    });
    const runDir = await buildRunDir(["done-a", "done-b"]);
    const { result, record } = await grade(family, runDir);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(record.grade.verdict, "fail");
    assert.strictEqual(record.grade.score, 0);
    assert.strictEqual(record.exitCode, 1);
  });

  test("gate rows only → binary record with no score key", async () => {
    const family = await buildGradeFamily({ withSuite: false });
    const runDir = await buildRunDir([]);
    const { result, record } = await grade(family, runDir);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(record.grade, { verdict: "pass", gatesPass: true });
    assert.ok(!("hiddenTests" in record));
  });
});
