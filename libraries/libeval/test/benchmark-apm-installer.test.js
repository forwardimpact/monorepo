import { describe, test } from "node:test";
import assert from "node:assert";
import {
  mkdtempSync,
  existsSync,
  rmSync,
  writeFileSync,
  renameSync,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTaskFamily } from "../src/benchmark/task-family.js";
import { installApm } from "../src/benchmark/apm-installer.js";
import { materialiseBenchmarkFamily } from "./benchmark-fixture.js";

describe("installApm", () => {
  test("copies <family>/.claude/ into <output>/.apm-staging/.claude/", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const family = await loadTaskFamily(root);
    const outputDir = mkdtempSync(join(tmpdir(), "fb-out-"));
    const { stagingDir, skillSetHash } = await installApm(family, outputDir);
    assert.strictEqual(stagingDir, join(outputDir, ".apm-staging"));
    assert.ok(
      existsSync(join(stagingDir, ".claude", "skills", "noop", "SKILL.md")),
    );
    assert.ok(existsSync(join(stagingDir, ".claude", "agents", "judge.md")));
    assert.match(skillSetHash, /^sha256:[0-9a-f]{64}$/);
  });

  test("skillSetHash is stable across two installs of the same family", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const family = await loadTaskFamily(root);
    const out1 = mkdtempSync(join(tmpdir(), "fb-out-"));
    const out2 = mkdtempSync(join(tmpdir(), "fb-out-"));
    const a = await installApm(family, out1);
    const b = await installApm(family, out2);
    assert.strictEqual(a.skillSetHash, b.skillSetHash);
  });

  test("skillSetHash flips on a one-byte change to apm.lock.yaml", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const familyBefore = await loadTaskFamily(root);
    const out = mkdtempSync(join(tmpdir(), "fb-out-"));
    const { skillSetHash: before } = await installApm(familyBefore, out);

    appendFileSync(join(root, "apm.lock.yaml"), "# mutate\n");
    const familyAfter = await loadTaskFamily(root);
    const out2 = mkdtempSync(join(tmpdir(), "fb-out-"));
    const { skillSetHash: after } = await installApm(familyAfter, out2);
    assert.notStrictEqual(before, after);
  });

  test("idempotent: a second install removes and recreates the staging tree", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const family = await loadTaskFamily(root);
    const out = mkdtempSync(join(tmpdir(), "fb-out-"));
    const { stagingDir } = await installApm(family, out);
    const stale = join(stagingDir, "stale-file.txt");
    writeFileSync(stale, "stale");
    await installApm(family, out);
    assert.strictEqual(existsSync(stale), false);
  });

  test("rejects apm.lock.yml (wrong extension) with a pointed error", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const family = await loadTaskFamily(root);
    renameSync(join(root, "apm.lock.yaml"), join(root, "apm.lock.yml"));
    const out = mkdtempSync(join(tmpdir(), "fb-out-"));
    await assert.rejects(installApm(family, out), /apm\.lock\.yaml/);
  });

  test("rejects when .claude/ is absent from the family root", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const family = await loadTaskFamily(root);
    rmSync(join(root, ".claude"), { recursive: true });
    const out = mkdtempSync(join(tmpdir(), "fb-out-"));
    await assert.rejects(installApm(family, out), /\.claude\//);
  });
});
