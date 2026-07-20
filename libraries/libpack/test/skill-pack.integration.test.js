import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { mkdtemp, mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { SkillPackPublisher, injectFrontmatter } from "../src/skill-pack.js";

const runtime = createDefaultRuntime();

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "libpack-skillpack-"));
}

/** Build a `.claude`-shaped source tree under a fresh temp dir. */
async function makeSource() {
  const source = join(await makeTempDir(), ".claude");
  await mkdir(join(source, "skills", "kata-review"), { recursive: true });
  await writeFile(
    join(source, "skills", "kata-review", "SKILL.md"),
    "---\nname: kata-review\ndescription: Review an artifact\n---\n# Review\n",
  );
  // A different prefix that must NOT be selected.
  await mkdir(join(source, "skills", "fit-map"), { recursive: true });
  await writeFile(
    join(source, "skills", "fit-map", "SKILL.md"),
    "---\nname: fit-map\ndescription: Map\n---\n# Map\n",
  );
  await mkdir(join(source, "agents"), { recursive: true });
  await writeFile(
    join(source, "agents", "staff-engineer.md"),
    "---\nname: staff-engineer\ndescription: Staff engineer profile\n---\n# Staff\n",
  );
  // References are flat siblings of the profiles, identified by the absence of
  // agent frontmatter (and the x- naming convention).
  await writeFile(join(source, "agents", "x-memory.md"), "# Memory protocol\n");
  return source;
}

describe("injectFrontmatter", () => {
  test("inserts license and metadata before the closing fence", () => {
    const out = injectFrontmatter("---\nname: x\n---\n# Body\n", "1.2.3");
    expect(out).toContain("license: Apache-2.0");
    expect(out).toContain("metadata:");
    expect(out).toContain('  version: "1.2.3"');
    expect(out).toContain("  author: forwardimpact");
    // Body and name survive.
    expect(out).toContain("name: x");
    expect(out).toContain("# Body");
  });

  test("returns content without frontmatter unchanged", () => {
    const input = "# No frontmatter\n";
    expect(injectFrontmatter(input, "1.0.0")).toBe(input);
  });
});

describe("SkillPackPublisher", () => {
  test("requires a runtime", () => {
    expect(() => new SkillPackPublisher({})).toThrow("runtime is required");
  });

  test("stages skills and agents under .apm/ with prefix filtering", async () => {
    const source = await makeSource();
    const target = await makeTempDir();
    const publisher = new SkillPackPublisher({ runtime });

    const result = await publisher.publish({
      sourceDir: source,
      prefix: "kata",
      targetDir: target,
      name: "kata-skills",
      version: "1.2.3",
      withAgents: true,
      description: "Kata agent team",
      readmeTitle: "Kata Skills",
      readmeIntro: "Agents and skills.",
    });

    // Selected skill staged at the canonical path.
    expect(
      existsSync(join(target, ".apm", "skills", "kata-review", "SKILL.md")),
    ).toBe(true);
    // Other-prefix skill excluded.
    expect(existsSync(join(target, ".apm", "skills", "fit-map"))).toBe(false);
    // Agent uses the .agent.md suffix.
    expect(
      existsSync(join(target, ".apm", "agents", "staff-engineer.agent.md")),
    ).toBe(true);
    // References ship flat alongside agents, no references/ subdir.
    expect(existsSync(join(target, ".apm", "agents", "x-memory.md"))).toBe(
      true,
    );
    expect(existsSync(join(target, ".apm", "agents", "references"))).toBe(
      false,
    );

    expect(result.skills).toEqual([
      { name: "kata-review", description: "Review an artifact" },
    ]);
    // The frontmatter-less reference is excluded from the agents table, even
    // though the unified pass now reads it.
    expect(result.agents).toEqual([
      { name: "staff-engineer", description: "Staff engineer profile" },
    ]);
  });

  test("all: stages every skill regardless of prefix", async () => {
    const source = await makeSource();
    const target = await makeTempDir();

    const result = await new SkillPackPublisher({ runtime }).publish({
      sourceDir: source,
      all: true,
      targetDir: target,
      name: "outpost-skills",
      version: "3.11.0",
      withAgents: true,
    });

    // Both prefixes staged — the directory itself is the pack boundary.
    expect(
      existsSync(join(target, ".apm", "skills", "kata-review", "SKILL.md")),
    ).toBe(true);
    expect(
      existsSync(join(target, ".apm", "skills", "fit-map", "SKILL.md")),
    ).toBe(true);
    expect(result.skills.map((s) => s.name).sort()).toEqual([
      "fit-map",
      "kata-review",
    ]);
  });

  test("repeated prefixes select each family plus the exact-name dir", async () => {
    const source = await makeSource();
    // A product skill whose dir IS the prefix (no dash), plus a capability
    // skill under the same family.
    await mkdir(join(source, "skills", "gemba"), { recursive: true });
    await writeFile(
      join(source, "skills", "gemba", "SKILL.md"),
      "---\nname: gemba\ndescription: Platform\n---\n# Platform\n",
    );
    await mkdir(join(source, "skills", "gemba-wiki"), { recursive: true });
    await writeFile(
      join(source, "skills", "gemba-wiki", "SKILL.md"),
      "---\nname: gemba-wiki\ndescription: Memory\n---\n# Memory\n",
    );
    const target = await makeTempDir();

    const result = await new SkillPackPublisher({ runtime }).publish({
      sourceDir: source,
      prefix: ["fit", "gemba"],
      targetDir: target,
      name: "fit-skills",
      version: "1.0.0",
    });

    expect(result.skills.map((s) => s.name).sort()).toEqual([
      "fit-map",
      "gemba",
      "gemba-wiki",
    ]);
    // The other family stays out.
    expect(existsSync(join(target, ".apm", "skills", "kata-review"))).toBe(
      false,
    );
  });

  test("a single-prefix string keeps selecting exactly its family", async () => {
    const source = await makeSource();
    // An exact-name dir for the prefix must also select in string form.
    await mkdir(join(source, "skills", "kata"), { recursive: true });
    await writeFile(
      join(source, "skills", "kata", "SKILL.md"),
      "---\nname: kata\ndescription: Team\n---\n# Team\n",
    );
    const target = await makeTempDir();

    const result = await new SkillPackPublisher({ runtime }).publish({
      sourceDir: source,
      prefix: "kata",
      targetDir: target,
      name: "kata-skills",
      version: "1.0.0",
    });

    expect(result.skills.map((s) => s.name).sort()).toEqual([
      "kata",
      "kata-review",
    ]);
  });

  test("injects version metadata into staged SKILL.md", async () => {
    const source = await makeSource();
    const target = await makeTempDir();
    await new SkillPackPublisher({ runtime }).publish({
      sourceDir: source,
      prefix: "kata",
      targetDir: target,
      name: "kata-skills",
      version: "9.9.9",
      withAgents: true,
    });
    const skillMd = await readFile(
      join(target, ".apm", "skills", "kata-review", "SKILL.md"),
      "utf-8",
    );
    expect(skillMd).toContain('  version: "9.9.9"');
    expect(skillMd).toContain("license: Apache-2.0");
  });

  test("writes a valid apm.yml manifest", async () => {
    const source = await makeSource();
    const target = await makeTempDir();
    await new SkillPackPublisher({ runtime }).publish({
      sourceDir: source,
      prefix: "kata",
      targetDir: target,
      name: "kata-skills",
      version: "1.2.3",
      withAgents: true,
      description: "Kata agent team",
    });
    const apm = await readFile(join(target, "apm.yml"), "utf-8");
    expect(apm).toContain("name: kata-skills");
    expect(apm).toContain("version: 1.2.3");
    expect(apm).toContain("includes: auto");
    expect(apm).toContain("Kata agent team");
  });

  test("README has the APM install command and tables, never npx skills", async () => {
    const source = await makeSource();
    const target = await makeTempDir();
    await new SkillPackPublisher({ runtime }).publish({
      sourceDir: source,
      prefix: "kata",
      targetDir: target,
      name: "kata-skills",
      version: "1.2.3",
      withAgents: true,
      readmeTitle: "Kata Skills",
      readmeIntro: "Agents and skills.",
    });
    const readme = await readFile(join(target, "README.md"), "utf-8");
    expect(readme).toContain("# Kata Skills");
    expect(readme).toContain("apm install forwardimpact/kata-skills");
    expect(readme).toContain("## Available Skills");
    expect(readme).toContain("| **kata-review** | Review an artifact |");
    expect(readme).toContain("## Available Agents");
    expect(readme).toContain("| **staff-engineer** | Staff engineer profile |");
    expect(readme).not.toContain("npx skills");
  });

  test("without agents: references still ship, no Available Agents section", async () => {
    const source = await makeSource();
    const target = await makeTempDir();
    const { agents } = await new SkillPackPublisher({ runtime }).publish({
      sourceDir: source,
      prefix: "kata",
      targetDir: target,
      name: "fit-skills",
      version: "1.0.0",
      withAgents: false,
    });
    expect(agents).toEqual([]);
    expect(
      existsSync(join(target, ".apm", "agents", "staff-engineer.agent.md")),
    ).toBe(false);
    // References still ship flat for a skills-only pack.
    expect(existsSync(join(target, ".apm", "agents", "x-memory.md"))).toBe(
      true,
    );
    const readme = await readFile(join(target, "README.md"), "utf-8");
    expect(readme).not.toContain("## Available Agents");
  });

  test("retires a pre-existing flat layout", async () => {
    const source = await makeSource();
    const target = await makeTempDir();
    // Simulate the old flat layout left over from a prior publish.
    await mkdir(join(target, "skills", "kata-stale"), { recursive: true });
    await writeFile(join(target, "skills", "kata-stale", "SKILL.md"), "old");
    await mkdir(join(target, "agents"), { recursive: true });
    await writeFile(join(target, "agents", "old.agent.md"), "old");

    await new SkillPackPublisher({ runtime }).publish({
      sourceDir: source,
      prefix: "kata",
      targetDir: target,
      name: "kata-skills",
      version: "1.2.3",
      withAgents: true,
    });

    expect(existsSync(join(target, "skills"))).toBe(false);
    expect(existsSync(join(target, "agents"))).toBe(false);
    expect(existsSync(join(target, ".apm", "skills", "kata-review"))).toBe(
      true,
    );
  });
});
