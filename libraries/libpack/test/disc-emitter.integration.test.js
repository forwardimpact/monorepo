import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
const runtime = createDefaultRuntime();
import { mkdtemp, mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";
import { DiscEmitter } from "../src/disc-emitter.js";

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "libpack-disc-"));
}

async function createSkillsDir() {
  const dir = await makeTempDir();
  const skill1 = join(dir, "kata-review");
  const skill2 = join(dir, "kata-plan");
  await mkdir(skill1, { recursive: true });
  await mkdir(skill2, { recursive: true });
  await writeFile(
    join(skill1, "SKILL.md"),
    "---\nname: kata-review\ndescription: Review artifacts\n---\n# Review\n",
  );
  await writeFile(
    join(skill2, "SKILL.md"),
    "---\nname: kata-plan\ndescription: Write plans\n---\n# Plan\n",
  );
  return dir;
}

describe("DiscEmitter", () => {
  test("emit creates well-known skills directory with index", async () => {
    const skillsDir = await createSkillsDir();
    const outputDir = await makeTempDir();

    const emitter = new DiscEmitter({ runtime });
    const entries = await emitter.emit(skillsDir, outputDir);

    expect(entries).toHaveLength(2);

    const indexPath = join(outputDir, ".well-known", "skills", "index.json");
    expect(existsSync(indexPath)).toBe(true);

    const index = JSON.parse(await readFile(indexPath, "utf-8"));
    expect(index.$schema).toContain("agentskills.io");
    expect(index.skills).toHaveLength(2);

    const names = index.skills.map((s) => s.name).sort();
    expect(names).toEqual(["kata-plan", "kata-review"]);

    expect(
      existsSync(
        join(outputDir, ".well-known", "skills", "kata-review", "SKILL.md"),
      ),
    ).toBe(true);
  });

  test("emitAggregate deduplicates skills across packs", async () => {
    const packsDir = await makeTempDir();
    const emitter = new DiscEmitter({ runtime });

    // Create two per-pack skill repos with overlapping skills
    const skills1 = await createSkillsDir();
    const pack1Dir = join(packsDir, "pack-a");
    await mkdir(pack1Dir, { recursive: true });
    const entries1 = await emitter.emit(skills1, pack1Dir);

    const skills2 = await createSkillsDir();
    const pack2Dir = join(packsDir, "pack-b");
    await mkdir(pack2Dir, { recursive: true });
    const entries2 = await emitter.emit(skills2, pack2Dir);

    await emitter.emitAggregate(packsDir, [
      { packName: "pack-a", entries: entries1 },
      { packName: "pack-b", entries: entries2 },
    ]);

    const indexPath = join(packsDir, ".well-known", "skills", "index.json");
    const index = JSON.parse(await readFile(indexPath, "utf-8"));
    expect(index.skills).toHaveLength(2);
  });
});
