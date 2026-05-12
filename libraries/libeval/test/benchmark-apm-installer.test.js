import { describe, test } from "node:test";
import assert from "node:assert";
import { access, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installApm } from "../src/benchmark/apm-installer.js";
import { loadTaskFamily } from "../src/benchmark/task-family.js";

const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

describe("installApm", () => {
  test("runs apm install and stages .claude/ with a stable skillSetHash", async () => {
    const family = await loadTaskFamily(FIXTURE);
    const out = await mkdtemp(join(tmpdir(), "benchmark-apm-"));
    const { stagingDir, skillSetHash, judgeProfilesDir } = await installApm(family, out);
    assert.strictEqual(stagingDir, join(out, ".apm-staging"));
    assert.match(skillSetHash, /^sha256:[0-9a-f]{64}$/);
    await access(join(stagingDir, ".claude", "skills", "noop", "SKILL.md"));
    await access(join(judgeProfilesDir, "judge.md"));
  });

  test("two consecutive runs on the same family produce the same skillSetHash", async () => {
    const family = await loadTaskFamily(FIXTURE);
    const a = await installApm(
      family,
      await mkdtemp(join(tmpdir(), "benchmark-apm-a-")),
    );
    const b = await installApm(
      family,
      await mkdtemp(join(tmpdir(), "benchmark-apm-b-")),
    );
    assert.strictEqual(a.skillSetHash, b.skillSetHash);
  });

  test("lockfile mutation flips the skillSetHash", async () => {
    const dir = await mkdtemp(join(tmpdir(), "benchmark-apm-mut-"));
    await cp(FIXTURE, dir, { recursive: true });
    const before = await installApm(
      await loadTaskFamily(dir),
      await mkdtemp(join(tmpdir(), "benchmark-apm-mut-out1-")),
    );
    await writeFile(
      join(dir, "apm.lock.yaml"),
      "apm_lock_version: 1\ndependencies: []\ndeployed_files: []\nlocal_deployed_files: []\nextra: row\n",
    );
    const after = await installApm(
      await loadTaskFamily(dir),
      await mkdtemp(join(tmpdir(), "benchmark-apm-mut-out2-")),
    );
    assert.notStrictEqual(before.skillSetHash, after.skillSetHash);
  });

  test("throws when apm install does not produce .claude/", async () => {
    const dir = await mkdtemp(join(tmpdir(), "benchmark-apm-no-claude-"));
    await writeFile(join(dir, "apm.yml"), "name: empty\nversion: 0.0.0\ndependencies:\n  apm: []\n");
    await writeFile(join(dir, "apm.lock.yaml"), "apm_lock_version: 1\ndependencies: []\n");
    const family = await loadTaskFamily(dir);
    await assert.rejects(
      installApm(family, await mkdtemp(join(tmpdir(), "benchmark-apm-out-"))),
      /did not produce \.claude\//,
    );
  });

  test("is idempotent: a previous staging directory is wiped and recreated", async () => {
    const family = await loadTaskFamily(FIXTURE);
    const out = await mkdtemp(join(tmpdir(), "benchmark-apm-idem-"));
    await installApm(family, out);
    const stale = join(out, ".apm-staging", "stale.txt");
    await writeFile(stale, "x");
    await installApm(family, out);
    await assert.rejects(access(stale));
    await rm(out, { recursive: true, force: true });
  });
});
