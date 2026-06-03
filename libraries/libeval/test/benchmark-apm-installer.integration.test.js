import { describe, test } from "node:test";
import assert from "node:assert";
import { access, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApmInstaller } from "../src/benchmark/apm-installer.js";
import { loadTaskFamily } from "../src/benchmark/task-family.js";
import {
  makeFakeSubprocess,
  realRuntimeWithSubprocess,
} from "./real-runtime.js";

const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

function newInstaller(opts) {
  return createApmInstaller({
    runtime: realRuntimeWithSubprocess(makeFakeSubprocess(opts)),
  });
}

function rt(opts) {
  return realRuntimeWithSubprocess(makeFakeSubprocess(opts));
}

describe("ApmInstaller.install", () => {
  test("runs apm install and stages .claude/ with a stable skillSetHash", async () => {
    const runtime = rt();
    const family = await loadTaskFamily(FIXTURE, runtime);
    const out = await mkdtemp(join(tmpdir(), "benchmark-apm-"));
    const installer = createApmInstaller({ runtime });
    const { stagingDir, skillSetHash, judgeProfilesDir } =
      await installer.install(family, out);
    assert.strictEqual(stagingDir, join(out, ".apm-staging"));
    assert.match(skillSetHash, /^sha256:[0-9a-f]{64}$/);
    await access(join(stagingDir, ".claude", "skills", "noop", "SKILL.md"));
    await access(join(judgeProfilesDir, "judge.md"));
    const apmCalls = runtime.subprocess.calls.filter((c) => c.cmd === "apm");
    assert.strictEqual(apmCalls.length, 1);
    assert.deepStrictEqual(apmCalls[0].args, ["install", "--target", "claude"]);
    assert.strictEqual(apmCalls[0].options.cwd, family.rootPath);
  });

  test("two consecutive runs on the same family produce the same skillSetHash", async () => {
    const family = await loadTaskFamily(FIXTURE, rt());
    const a = await newInstaller().install(
      family,
      await mkdtemp(join(tmpdir(), "benchmark-apm-a-")),
    );
    const b = await newInstaller().install(
      family,
      await mkdtemp(join(tmpdir(), "benchmark-apm-b-")),
    );
    assert.strictEqual(a.skillSetHash, b.skillSetHash);
  });

  test("lockfile mutation flips the skillSetHash", async () => {
    const dir = await mkdtemp(join(tmpdir(), "benchmark-apm-mut-"));
    await cp(FIXTURE, dir, { recursive: true });
    const before = await newInstaller().install(
      await loadTaskFamily(dir, rt()),
      await mkdtemp(join(tmpdir(), "benchmark-apm-mut-out1-")),
    );
    await writeFile(
      join(dir, "apm.lock.yaml"),
      "apm_lock_version: 1\ndependencies: []\ndeployed_files: []\nlocal_deployed_files: []\nextra: row\n",
    );
    const after = await newInstaller().install(
      await loadTaskFamily(dir, rt()),
      await mkdtemp(join(tmpdir(), "benchmark-apm-mut-out2-")),
    );
    assert.notStrictEqual(before.skillSetHash, after.skillSetHash);
  });

  test("throws when apm install does not produce .claude/", async () => {
    const dir = await mkdtemp(join(tmpdir(), "benchmark-apm-no-claude-"));
    await writeFile(
      join(dir, "apm.yml"),
      "name: empty\nversion: 0.0.0\ndependencies:\n  apm: []\n",
    );
    await writeFile(
      join(dir, "apm.lock.yaml"),
      "apm_lock_version: 1\ndependencies: []\n",
    );
    const family = await loadTaskFamily(dir, rt());
    await assert.rejects(
      newInstaller().install(
        family,
        await mkdtemp(join(tmpdir(), "benchmark-apm-out-")),
      ),
      /did not produce \.claude\//,
    );
  });

  test("propagates non-zero exit codes from apm", async () => {
    const family = await loadTaskFamily(FIXTURE, rt());
    const installer = newInstaller({ exitCode: 2, stderr: "boom" });
    await assert.rejects(
      installer.install(
        family,
        await mkdtemp(join(tmpdir(), "benchmark-apm-bad-")),
      ),
      /apm install exited 2: boom/,
    );
  });

  test("propagates spawn errors as a non-zero exit", async () => {
    const family = await loadTaskFamily(FIXTURE, rt());
    const installer = newInstaller({
      spawnError: new Error("ENOENT: apm not found"),
    });
    await assert.rejects(
      installer.install(
        family,
        await mkdtemp(join(tmpdir(), "benchmark-apm-spawn-err-")),
      ),
      /apm install exited 127/,
    );
  });

  test("is idempotent: a previous staging directory is wiped and recreated", async () => {
    const family = await loadTaskFamily(FIXTURE, rt());
    const out = await mkdtemp(join(tmpdir(), "benchmark-apm-idem-"));
    await newInstaller().install(family, out);
    const stale = join(out, ".apm-staging", "stale.txt");
    await writeFile(stale, "x");
    await newInstaller().install(family, out);
    await assert.rejects(access(stale));
    await rm(out, { recursive: true, force: true });
  });
});
