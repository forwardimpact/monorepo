import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { mkdtemp, mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  SkillPackPublisher,
  injectFrontmatter,
  markdownLinkTargets,
  referenceClosure,
  referenceTarget,
} from "../src/skill-pack.js";

const runtime = createDefaultRuntime();

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "libpack-skillpack-"));
}

/** Build a `.claude`-shaped source tree under a fresh temp dir. */
async function makeSource() {
  const source = join(await makeTempDir(), ".claude");
  await mkdir(join(source, "skills", "kata-review"), { recursive: true });
  // The skill cites one reference the way monorepo skills do: relative to
  // the skills dir, with a fragment.
  await writeFile(
    join(source, "skills", "kata-review", "SKILL.md"),
    "---\nname: kata-review\ndescription: Review an artifact\n---\n# Review\n" +
      "See [memory](../../agents/x-memory.md#on-boot).\n",
  );
  // A different prefix that the publisher must NOT select.
  await mkdir(join(source, "skills", "fit-map"), { recursive: true });
  await writeFile(
    join(source, "skills", "fit-map", "SKILL.md"),
    "---\nname: fit-map\ndescription: Map\n---\n# Map\n",
  );
  await mkdir(join(source, "agents"), { recursive: true });
  // The profile cites a reference the way monorepo profiles do: with a
  // repo-root-relative path.
  await writeFile(
    join(source, "agents", "staff-engineer.md"),
    "---\nname: staff-engineer\ndescription: Staff engineer profile\n---\n# Staff\n" +
      "Follow [auth-anomaly](.claude/agents/x-auth.md).\n",
  );
  // References are flat siblings of the profiles. The absence of agent
  // frontmatter identifies them, as does the x- naming convention. They cite
  // each other with bare filenames.
  await writeFile(
    join(source, "agents", "x-memory.md"),
    "# Memory protocol\nSee [work](x-work.md).\n",
  );
  await writeFile(join(source, "agents", "x-work.md"), "# Work definition\n");
  await writeFile(join(source, "agents", "x-auth.md"), "# Auth anomaly\n");
  // Nothing cites this one. It must never ship.
  await writeFile(join(source, "agents", "x-orphan.md"), "# Orphan\n");
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

describe("markdownLinkTargets", () => {
  test("extracts inline links and strips fragments, queries, and titles", () => {
    const md = [
      "See [a](x-a.md#section) and [b](../../agents/x-b.md?x=1).",
      '[c](<x-c.md> "Title") plus [d]( x-d.md ).',
      "[def]: .claude/agents/x-e.md",
      "Not a link: x-f.md",
    ].join("\n");
    expect(markdownLinkTargets(md)).toEqual([
      "x-a.md",
      "../../agents/x-b.md",
      "x-c.md",
      "x-d.md",
      ".claude/agents/x-e.md",
    ]);
  });
});

describe("referenceTarget", () => {
  test("resolves the three link shapes that reach the agents dir", () => {
    expect(referenceTarget(".claude/agents/x-a.md", true)).toBe("x-a.md");
    expect(referenceTarget("../../agents/x-a.md", false)).toBe("x-a.md");
    expect(referenceTarget("../../../agents/x-a.md", false)).toBe("x-a.md");
    expect(referenceTarget("x-a.md", true)).toBe("x-a.md");
  });

  test("rejects bare names from skills, other dirs, URLs, and non-markdown", () => {
    // A bare name inside a skill resolves to the skill dir, not agents/.
    expect(referenceTarget("x-a.md", false)).toBe(null);
    // A skill-local reference is not a shared reference.
    expect(referenceTarget("references/x-a.md", false)).toBe(null);
    expect(referenceTarget("wiki/x-a.md", true)).toBe(null);
    expect(
      referenceTarget("https://example.com/.claude/agents/x-a.md", true),
    ).toBe(null);
    expect(referenceTarget("mailto:x-a.md", true)).toBe(null);
    expect(referenceTarget("../../agents/x-a.yaml", false)).toBe(null);
    expect(referenceTarget("", true)).toBe(null);
  });
});

describe("referenceClosure", () => {
  test("follows links between references to a fixpoint and skips unknowns", () => {
    const references = new Map([
      ["x-a.md", "[b](x-b.md)"],
      ["x-b.md", "[c](x-c.md) [a](x-a.md) [gone](x-gone.md)"],
      ["x-c.md", "end"],
      ["x-orphan.md", "[a](x-a.md)"],
    ]);
    const roots = [{ content: "[a](../../agents/x-a.md)", inAgentsDir: false }];
    expect([...referenceClosure(roots, references)].sort()).toEqual([
      "x-a.md",
      "x-b.md",
      "x-c.md",
    ]);
  });

  test("returns an empty set for roots with no citations", () => {
    const references = new Map([["x-a.md", ""]]);
    expect(
      referenceClosure([{ content: "# Plain", inAgentsDir: false }], references)
        .size,
    ).toBe(0);
  });
});

describe("SkillPackPublisher", () => {
  test("requires a runtime", () => {
    expect(() => new SkillPackPublisher({})).toThrow("runtime is required");
  });

  test("stages skills and agents under .apm/ and filters by prefix", async () => {
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

    // The publisher staged the selected skill at the canonical path.
    expect(
      existsSync(join(target, ".apm", "skills", "kata-review", "SKILL.md")),
    ).toBe(true);
    // The publisher excluded the other-prefix skill.
    expect(existsSync(join(target, ".apm", "skills", "fit-map"))).toBe(false);
    // Agent uses the .agent.md suffix.
    expect(
      existsSync(join(target, ".apm", "agents", "staff-engineer.agent.md")),
    ).toBe(true);
    // References ship flat alongside agents. No references/ subdir exists.
    expect(existsSync(join(target, ".apm", "agents", "x-memory.md"))).toBe(
      true,
    );
    expect(existsSync(join(target, ".apm", "agents", "references"))).toBe(
      false,
    );
    // The profile's citation ships. So does the reference that x-memory
    // cites. The orphan stays out.
    expect(existsSync(join(target, ".apm", "agents", "x-auth.md"))).toBe(true);
    expect(existsSync(join(target, ".apm", "agents", "x-work.md"))).toBe(true);
    expect(existsSync(join(target, ".apm", "agents", "x-orphan.md"))).toBe(
      false,
    );
    expect(result.references).toEqual([
      "x-auth.md",
      "x-memory.md",
      "x-work.md",
    ]);

    expect(result.skills).toEqual([
      { name: "kata-review", description: "Review an artifact" },
    ]);
    // The agents table excludes the frontmatter-less reference, even though
    // the unified pass now reads it.
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

    // The publisher staged both prefixes. The directory is the pack boundary.
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

  test("a single-prefix string still selects exactly its family", async () => {
    const source = await makeSource();
    // The prefix in string form must also select the exact-name dir.
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

  test("without agents: only skill-cited references ship, no Available Agents section", async () => {
    const source = await makeSource();
    const target = await makeTempDir();
    const { agents, references } = await new SkillPackPublisher({
      runtime,
    }).publish({
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
    // The reference the skill cites still ships flat, with its transitive
    // citation. The reference only the profile cites stays out.
    expect(existsSync(join(target, ".apm", "agents", "x-memory.md"))).toBe(
      true,
    );
    expect(existsSync(join(target, ".apm", "agents", "x-work.md"))).toBe(true);
    expect(existsSync(join(target, ".apm", "agents", "x-auth.md"))).toBe(false);
    expect(references).toEqual(["x-memory.md", "x-work.md"]);
    const readme = await readFile(join(target, "README.md"), "utf-8");
    expect(readme).not.toContain("## Available Agents");
  });

  test("a pack whose skills cite no reference ships no reference", async () => {
    const source = await makeSource();
    const target = await makeTempDir();
    // fit-map cites nothing. Without agents, the closure is empty.
    const { references } = await new SkillPackPublisher({ runtime }).publish({
      sourceDir: source,
      prefix: "fit",
      targetDir: target,
      name: "fit-skills",
      version: "1.0.0",
    });
    expect(references).toEqual([]);
    expect(existsSync(join(target, ".apm", "agents"))).toBe(false);
  });

  test("a citation inside a skill's references/ dir counts", async () => {
    const source = await makeSource();
    // Move the citation out of SKILL.md and into a nested reference file.
    await writeFile(
      join(source, "skills", "kata-review", "SKILL.md"),
      "---\nname: kata-review\ndescription: Review an artifact\n---\n# Review\n",
    );
    await mkdir(join(source, "skills", "kata-review", "references"), {
      recursive: true,
    });
    await writeFile(
      join(source, "skills", "kata-review", "references", "metrics.md"),
      "See [auth](../../../agents/x-auth.md).\n",
    );
    const target = await makeTempDir();
    const { references } = await new SkillPackPublisher({ runtime }).publish({
      sourceDir: source,
      prefix: "kata",
      targetDir: target,
      name: "kata-skills",
      version: "1.0.0",
    });
    expect(references).toEqual(["x-auth.md"]);
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
