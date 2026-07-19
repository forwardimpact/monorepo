import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdir, mkdtemp, cp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertJudgeProfileStaged,
  loadTaskFamily,
} from "../src/benchmark/task-family.js";
import { createApmInstaller } from "../src/benchmark/apm-installer.js";
import { realRuntimeWithSubprocess } from "./real-runtime.js";

const RT = realRuntimeWithSubprocess();

function newInstaller() {
  return createApmInstaller({ runtime: RT });
}

const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

async function copyFixture() {
  const dest = await mkdtemp(join(tmpdir(), "benchmark-tf-"));
  await cp(FIXTURE, dest, { recursive: true });
  return dest;
}

describe("loadTaskFamily", () => {
  test("loads tasks with METR-style ids", async () => {
    const family = await loadTaskFamily(FIXTURE, RT);
    const tasks = family.tasks();
    const ids = tasks.map((t) => t.id);
    assert.deepStrictEqual(ids.sort(), [
      "fail",
      "pass",
      "preflight-broken",
      "repo-state",
    ]);
    for (const t of tasks) {
      assert.ok(t.paths.instructions.endsWith("agent.task.md"));
      assert.ok(t.paths.judge.endsWith("judge.task.md"));
      assert.ok(t.paths.supervisor.endsWith("supervisor.task.md"));
      assert.ok(t.paths.hooks.endsWith("hooks"));
      assert.ok(t.paths.workdir.endsWith("workdir"));
    }
  });

  test("familyRevision is stable across two consecutive loads", async () => {
    const a = await loadTaskFamily(FIXTURE, RT);
    const b = await loadTaskFamily(FIXTURE, RT);
    assert.strictEqual(a.familyRevision, b.familyRevision);
    assert.match(a.familyRevision, /^sha256:[0-9a-f]{64}$/);
  });

  test("familyRevision flips on a one-byte mutation under tasks/pass/workdir/", async () => {
    const dir = await copyFixture();
    const a = (await loadTaskFamily(dir, RT)).familyRevision;
    const target = join(dir, "tasks/pass/workdir/README.md");
    await writeFile(target, "Service scaffold lives here.\nEXTRA\n");
    const b = (await loadTaskFamily(dir, RT)).familyRevision;
    assert.notStrictEqual(a, b);
  });

  test("apm.lock.yaml hashes identically with LF and CRLF line endings", async () => {
    const apmYml = "name: test\nversion: 0.0.0\ndependencies:\n  apm: []\n";
    const lfDir = await mkdtemp(join(tmpdir(), "benchmark-lf-"));
    const crlfDir = await mkdtemp(join(tmpdir(), "benchmark-crlf-"));
    await cp(join(FIXTURE, ".claude"), join(lfDir, ".claude"), {
      recursive: true,
    });
    await cp(join(FIXTURE, ".claude"), join(crlfDir, ".claude"), {
      recursive: true,
    });
    await writeFile(join(lfDir, "apm.yml"), apmYml);
    await writeFile(join(crlfDir, "apm.yml"), apmYml);
    const content = "key: value\nother: thing\n";
    await writeFile(join(lfDir, "apm.lock.yaml"), content);
    await writeFile(
      join(crlfDir, "apm.lock.yaml"),
      content.replace(/\n/g, "\r\n"),
    );
    const lfFamily = await loadTaskFamily(lfDir, RT);
    const crlfFamily = await loadTaskFamily(crlfDir, RT);
    const lfOut = await newInstaller().install(
      lfFamily,
      await mkdtemp(join(tmpdir(), "benchmark-out-lf-")),
    );
    const crlfOut = await newInstaller().install(
      crlfFamily,
      await mkdtemp(join(tmpdir(), "benchmark-out-crlf-")),
    );
    assert.strictEqual(lfOut.skillSetHash, crlfOut.skillSetHash);
  });
});

describe("hidden test suite discovery", () => {
  async function makeSuiteFamily() {
    const dir = await mkdtemp(join(tmpdir(), "benchmark-suite-"));
    await mkdir(join(dir, "tasks/t1/tests"), { recursive: true });
    return dir;
  }

  test("task without tests/ carries a null suite", async () => {
    const family = await loadTaskFamily(FIXTURE, RT);
    for (const t of family.tasks()) {
      assert.strictEqual(t.tests, null);
      assert.strictEqual(t.paths.tests, null);
    }
  });

  test("nested overlay tree yields sorted checks with stage paths, roles, and names", async () => {
    const dir = await makeSuiteFamily();
    const tests = join(dir, "tasks/t1/tests");
    await mkdir(join(tests, "app/test"), { recursive: true });
    await writeFile(join(tests, "app/test/todo.gate.test.js"), "// gate\n");
    await writeFile(join(tests, "app/test/filter-b.test.js"), "// scored\n");
    await writeFile(join(tests, "app/test/filter-a.test.js"), "// scored\n");
    await writeFile(join(tests, "app/test/helpers.js"), "// support\n");
    await writeFile(join(tests, "notes.md"), "support at the root\n");

    const family = await loadTaskFamily(dir, RT);
    const task = family.tasks().find((t) => t.id === "t1");
    assert.strictEqual(task.paths.tests, tests);
    assert.deepStrictEqual(
      task.tests.checks.map((c) => ({
        name: c.name,
        gate: c.gate,
        stagePath: c.stagePath,
      })),
      [
        {
          name: "filter-a",
          gate: false,
          stagePath: "app/test/filter-a.test.js",
        },
        {
          name: "filter-b",
          gate: false,
          stagePath: "app/test/filter-b.test.js",
        },
        { name: "todo", gate: true, stagePath: "app/test/todo.gate.test.js" },
      ],
    );
    for (const c of task.tests.checks) {
      assert.strictEqual(c.sourcePath, join(tests, c.stagePath));
    }
    assert.deepStrictEqual(
      task.tests.support.map((s) => s.stagePath),
      ["app/test/helpers.js", "notes.md"],
    );
  });

  test("a suite with no check files fails the family load", async () => {
    const dir = await makeSuiteFamily();
    await writeFile(
      join(dir, "tasks/t1/tests/helpers.js"),
      "// support only\n",
    );
    await assert.rejects(loadTaskFamily(dir, RT), /no check files/);
  });

  test("a dangling symlink fails the family load", async () => {
    const dir = await makeSuiteFamily();
    const tests = join(dir, "tasks/t1/tests");
    await writeFile(join(tests, "ok.test.js"), "// check\n");
    await symlink(join(tests, "missing.js"), join(tests, "broken.test.js"));
    await assert.rejects(loadTaskFamily(dir, RT), /not a regular file/);
  });

  test("duplicate check names fail the family load", async () => {
    const dir = await makeSuiteFamily();
    const tests = join(dir, "tasks/t1/tests");
    await mkdir(join(tests, "a"), { recursive: true });
    await mkdir(join(tests, "b"), { recursive: true });
    await writeFile(join(tests, "a/todo.test.js"), "// one\n");
    await writeFile(join(tests, "b/todo.gate.test.js"), "// two\n");
    await assert.rejects(loadTaskFamily(dir, RT), /duplicate check name/);
  });
});

describe("assertJudgeProfileStaged", () => {
  test("resolves when the profile exists", async () => {
    const family = await loadTaskFamily(FIXTURE, RT);
    const out = await mkdtemp(join(tmpdir(), "benchmark-stage-"));
    const { judgeProfilesDir } = await newInstaller().install(family, out);
    await assertJudgeProfileStaged(family, judgeProfilesDir, "judge", RT);
  });

  test("throws when the profile is absent", async () => {
    const family = await loadTaskFamily(FIXTURE, RT);
    const out = await mkdtemp(join(tmpdir(), "benchmark-stage-miss-"));
    const { judgeProfilesDir } = await newInstaller().install(family, out);
    await assert.rejects(
      assertJudgeProfileStaged(family, judgeProfilesDir, "missing", RT),
      /judge profile not staged/,
    );
  });
});
