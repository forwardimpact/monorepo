import { describe, test } from "node:test";
import assert from "node:assert";
import { rmSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadTaskFamily,
  assertJudgeProfileStaged,
} from "../src/benchmark/task-family.js";
import { materialiseBenchmarkFamily } from "./benchmark-fixture.js";

describe("loadTaskFamily", () => {
  test("walks tasks/<family>/<name>/ and yields the four fixture tasks", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const family = await loadTaskFamily(root);
    const ids = Array.from(family.tasks(), (t) => t.id).sort();
    assert.deepStrictEqual(ids, [
      "tf/fail",
      "tf/pass",
      "tf/preflight-broken",
      "tf/repo-state",
    ]);
    for (const task of family.tasks()) {
      assert.ok(task.paths.instructions.endsWith("instructions.md"));
      assert.ok(task.paths.judge.endsWith("judge.task.md"));
      assert.ok(task.paths.workdir.endsWith("workdir"));
      assert.ok(task.paths.scoring.endsWith("scoring"));
      assert.ok(task.paths.specs.endsWith("specs"));
    }
  });

  test("familyRevision is byte-identical across consecutive loads", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const a = await loadTaskFamily(root);
    const b = await loadTaskFamily(root);
    assert.strictEqual(a.familyRevision, b.familyRevision);
    assert.match(a.familyRevision, /^sha256:[0-9a-f]{64}$/);
  });

  test("familyRevision flips on a one-byte mutation under tasks/tf/pass/workdir/", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const before = (await loadTaskFamily(root)).familyRevision;
    appendFileSync(
      join(root, "tasks", "tf", "pass", "workdir", "scripts", "preflight.sh"),
      "# touch\n",
    );
    const after = (await loadTaskFamily(root)).familyRevision;
    assert.notStrictEqual(before, after);
  });

  test("apmLockBytes survives LF normalisation (CRLF and LF lockfiles hash the same)", async () => {
    const { root: rootLf } = await materialiseBenchmarkFamily();
    const familyLf = await loadTaskFamily(rootLf);

    const { root: rootCrlf } = await materialiseBenchmarkFamily();
    const lockPath = join(rootCrlf, "apm.lock.yaml");
    const lf = familyLf.apmLockBytes.toString("utf8");
    writeFileSync(lockPath, lf.replace(/\n/g, "\r\n"));
    const familyCrlf = await loadTaskFamily(rootCrlf);

    assert.strictEqual(
      familyLf.apmLockBytes.toString("utf8"),
      familyCrlf.apmLockBytes.toString("utf8"),
    );
  });
});

describe("assertJudgeProfileStaged", () => {
  test("resolves when the profile file exists in the staging tree", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const family = await loadTaskFamily(root);
    await assertJudgeProfileStaged(family, root, "judge");
  });

  test("throws when the profile is missing", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const family = await loadTaskFamily(root);
    rmSync(join(root, ".claude", "agents", "judge.md"));
    await assert.rejects(
      assertJudgeProfileStaged(family, root, "judge"),
      /Judge profile not staged/,
    );
  });

  test("throws when the profiles directory does not exist", async () => {
    const { root } = await materialiseBenchmarkFamily({
      includeJudgeProfile: false,
    });
    const family = await loadTaskFamily(root);
    await assert.rejects(
      assertJudgeProfileStaged(family, root, "judge"),
      /Judge profile not staged/,
    );
  });
});

describe("loadTaskFamily error paths", () => {
  test("throws when root is not a directory", async () => {
    const tmp = join("/tmp", `nonexistent-${Date.now()}`);
    await assert.rejects(loadTaskFamily(tmp));
  });

  test("throws when apm.lock.yaml is missing", async () => {
    const { root } = await materialiseBenchmarkFamily();
    rmSync(join(root, "apm.lock.yaml"));
    await assert.rejects(loadTaskFamily(root));
  });

  test("handles a tasks/ directory that has no families gracefully", async () => {
    const root = "/tmp/empty-family-" + Date.now();
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "apm.lock.yaml"), "apm_version: 1\n");
    const family = await loadTaskFamily(root);
    assert.deepStrictEqual(Array.from(family.tasks()), []);
  });
});
