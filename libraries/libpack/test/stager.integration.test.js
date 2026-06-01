import { describe, test, expect } from "bun:test";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
const runtime = createDefaultRuntime();
import { mkdtemp, readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";
import { PackStager } from "../src/stager.js";

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "libpack-stager-"));
}

const CONTENT = {
  agents: [{ filename: "staff-engineer.md", content: "# Staff Engineer\n" }],
  skills: [
    {
      dirname: "kata-review",
      files: [
        {
          path: "SKILL.md",
          content: "---\nname: kata-review\n---\n# Review\n",
        },
        {
          path: "scripts/install.sh",
          content: "#!/bin/sh\necho ok\n",
          mode: 0o755,
        },
        {
          path: "references/protocol.md",
          content: "# Protocol\n",
        },
      ],
    },
  ],
  teamInstructions: "# Team\nFollow the plan.\n",
  claudeSettings: { permissions: { allow: ["Read"] } },
  vscodeSettings: { "editor.fontSize": 14 },
};

describe("PackStager", () => {
  test("stageFull creates expected file tree", async () => {
    const dir = await makeTempDir();
    const stager = new PackStager({ runtime });
    await stager.stageFull(dir, CONTENT);

    expect(
      existsSync(join(dir, ".claude", "agents", "staff-engineer.md")),
    ).toBe(true);
    expect(
      existsSync(join(dir, ".claude", "skills", "kata-review", "SKILL.md")),
    ).toBe(true);
    expect(
      existsSync(
        join(dir, ".claude", "skills", "kata-review", "scripts", "install.sh"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          dir,
          ".claude",
          "skills",
          "kata-review",
          "references",
          "protocol.md",
        ),
      ),
    ).toBe(true);
    expect(existsSync(join(dir, ".claude", "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(dir, ".claude", "settings.json"))).toBe(true);
    expect(existsSync(join(dir, ".vscode", "settings.json"))).toBe(true);

    const settings = JSON.parse(
      await readFile(join(dir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.permissions.allow).toEqual(["Read"]);
  });

  test("stageApm produces APM layout with lock file", async () => {
    const fullDir = await makeTempDir();
    const apmDir = await makeTempDir();
    const stager = new PackStager({ runtime });
    await stager.stageFull(fullDir, CONTENT);
    await stager.stageApm(fullDir, apmDir, "se-platform", "1.0.0");

    expect(
      existsSync(join(apmDir, ".claude", "skills", "kata-review", "SKILL.md")),
    ).toBe(true);
    expect(
      existsSync(join(apmDir, ".claude", "agents", "staff-engineer.md")),
    ).toBe(true);
    expect(existsSync(join(apmDir, ".claude", "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(apmDir, "apm.lock.yaml"))).toBe(true);

    // APM excludes settings
    expect(existsSync(join(apmDir, ".claude", "settings.json"))).toBe(false);
    expect(existsSync(join(apmDir, ".vscode"))).toBe(false);

    const lock = await readFile(join(apmDir, "apm.lock.yaml"), "utf-8");
    expect(lock).toContain("_local/se-platform");
    expect(lock).toContain("version: '1.0.0'");
    expect(lock).toContain(".claude/CLAUDE.md");
  });

  test("skillsDir returns .claude/skills path", () => {
    const stager = new PackStager({ runtime });
    expect(stager.skillsDir("/tmp/pack")).toBe("/tmp/pack/.claude/skills");
  });
});
