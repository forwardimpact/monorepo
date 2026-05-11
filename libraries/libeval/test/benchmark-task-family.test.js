import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtemp, cp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertJudgeProfileStaged,
  loadTaskFamily,
} from "../src/benchmark/task-family.js";
import { installApm } from "../src/benchmark/apm-installer.js";

const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

async function copyFixture() {
  const dest = await mkdtemp(join(tmpdir(), "benchmark-tf-"));
  await cp(FIXTURE, dest, { recursive: true });
  return dest;
}

describe("loadTaskFamily", () => {
  test("loads tasks with METR-style ids", async () => {
    const family = await loadTaskFamily(FIXTURE);
    const tasks = family.tasks();
    const ids = tasks.map((t) => t.id);
    assert.deepStrictEqual(ids.sort(), [
      "tf/fail",
      "tf/pass",
      "tf/preflight-broken",
      "tf/repo-state",
    ]);
    for (const t of tasks) {
      assert.ok(t.paths.instructions.endsWith("instructions.md"));
      assert.ok(t.paths.judge.endsWith("judge.task.md"));
      assert.ok(t.paths.supervisor.endsWith("supervisor.task.md"));
      assert.ok(t.paths.scoring.endsWith("scoring"));
      assert.ok(t.paths.workdir.endsWith("workdir"));
    }
  });

  test("familyRevision is stable across two consecutive loads", async () => {
    const a = await loadTaskFamily(FIXTURE);
    const b = await loadTaskFamily(FIXTURE);
    assert.strictEqual(a.familyRevision, b.familyRevision);
    assert.match(a.familyRevision, /^sha256:[0-9a-f]{64}$/);
  });

  test("familyRevision flips on a one-byte mutation under tasks/tf/pass/workdir/", async () => {
    const dir = await copyFixture();
    const a = (await loadTaskFamily(dir)).familyRevision;
    const target = join(dir, "tasks/tf/pass/workdir/README.md");
    await writeFile(target, "Service scaffold lives here.\nEXTRA\n");
    const b = (await loadTaskFamily(dir)).familyRevision;
    assert.notStrictEqual(a, b);
  });

  test("apm.lock.yaml hashes identically with LF and CRLF line endings", async () => {
    const lfDir = await mkdtemp(join(tmpdir(), "benchmark-lf-"));
    const crlfDir = await mkdtemp(join(tmpdir(), "benchmark-crlf-"));
    // Both must have at least a .claude/ tree for installApm.
    await cp(join(FIXTURE, ".claude"), join(lfDir, ".claude"), {
      recursive: true,
    });
    await cp(join(FIXTURE, ".claude"), join(crlfDir, ".claude"), {
      recursive: true,
    });
    const content = "key: value\nother: thing\n";
    await writeFile(join(lfDir, "apm.lock.yaml"), content);
    await writeFile(
      join(crlfDir, "apm.lock.yaml"),
      content.replace(/\n/g, "\r\n"),
    );
    const lfFamily = await loadTaskFamily(lfDir);
    const crlfFamily = await loadTaskFamily(crlfDir);
    const lfOut = await installApm(
      lfFamily,
      await mkdtemp(join(tmpdir(), "benchmark-out-lf-")),
    );
    const crlfOut = await installApm(
      crlfFamily,
      await mkdtemp(join(tmpdir(), "benchmark-out-crlf-")),
    );
    assert.strictEqual(lfOut.skillSetHash, crlfOut.skillSetHash);
  });
});

describe("assertJudgeProfileStaged", () => {
  test("resolves when the profile exists", async () => {
    const family = await loadTaskFamily(FIXTURE);
    const out = await mkdtemp(join(tmpdir(), "benchmark-stage-"));
    const { stagingDir } = await installApm(family, out);
    await assertJudgeProfileStaged(family, stagingDir, "judge");
  });

  test("throws when the profile is absent", async () => {
    const family = await loadTaskFamily(FIXTURE);
    const out = await mkdtemp(join(tmpdir(), "benchmark-stage-miss-"));
    const { stagingDir } = await installApm(family, out);
    await assert.rejects(
      assertJudgeProfileStaged(family, stagingDir, "missing"),
      /judge profile not staged/,
    );
  });
});
