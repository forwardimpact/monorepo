import { mkdir, readdir, cp, writeFile, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { collectFiles } from "./util.js";

/** Stage directory trees per layout (full, APM, skills). */
export class PackStager {
  /** Stage the full pack layout into dir from pre-formatted content. */
  async stageFull(dir, content) {
    const claudeDir = join(dir, ".claude");
    const agentsDir = join(claudeDir, "agents");
    const skillsDir = join(claudeDir, "skills");

    await mkdir(agentsDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });

    for (const agent of content.agents) {
      await writeFile(join(agentsDir, agent.filename), agent.content, "utf-8");
    }

    for (const skill of content.skills) {
      const skillDir = join(skillsDir, skill.dirname);
      await mkdir(skillDir, { recursive: true });

      for (const file of skill.files) {
        const filePath = join(skillDir, file.path);
        await mkdir(join(filePath, ".."), { recursive: true });
        if (file.mode) {
          await writeFile(filePath, file.content, { mode: file.mode });
        } else {
          await writeFile(filePath, file.content, "utf-8");
        }
      }
    }

    if (content.teamInstructions) {
      await writeFile(
        join(claudeDir, "CLAUDE.md"),
        content.teamInstructions,
        "utf-8",
      );
    }

    const settings = { ...(content.claudeSettings || {}) };
    await writeFile(
      join(claudeDir, "settings.json"),
      JSON.stringify(settings, null, 2) + "\n",
      "utf-8",
    );

    const vsSettings = { ...(content.vscodeSettings || {}) };
    if (Object.keys(vsSettings).length > 0) {
      const vscodeDir = join(dir, ".vscode");
      await mkdir(vscodeDir, { recursive: true });
      await writeFile(
        join(vscodeDir, "settings.json"),
        JSON.stringify(vsSettings, null, 2) + "\n",
        "utf-8",
      );
    }
  }

  /** Stage the APM bundle from a full staging dir. */
  async stageApm(fullDir, apmDir, packName, version) {
    const srcSkillsDir = join(fullDir, ".claude", "skills");
    const srcAgentsDir = join(fullDir, ".claude", "agents");
    const destSkillsDir = join(apmDir, ".claude", "skills");
    const destAgentsDir = join(apmDir, ".claude", "agents");

    await mkdir(destSkillsDir, { recursive: true });
    await mkdir(destAgentsDir, { recursive: true });

    const skillDirs = (
      await readdir(srcSkillsDir, { withFileTypes: true })
    ).filter((e) => e.isDirectory());
    for (const dir of skillDirs) {
      await cp(join(srcSkillsDir, dir.name), join(destSkillsDir, dir.name), {
        recursive: true,
      });
    }

    const agentFiles = (await readdir(srcAgentsDir)).filter((f) =>
      f.endsWith(".md"),
    );
    for (const file of agentFiles) {
      await cp(join(srcAgentsDir, file), join(destAgentsDir, file));
    }

    const srcClaudeMd = join(fullDir, ".claude", "CLAUDE.md");
    const destClaudeDir = join(apmDir, ".claude");
    if (existsSync(srcClaudeMd)) {
      await copyFile(srcClaudeMd, join(destClaudeDir, "CLAUDE.md"));
    }

    const deployedFiles = [];
    if (existsSync(join(destClaudeDir, "CLAUDE.md"))) {
      deployedFiles.push(".claude/CLAUDE.md");
    }
    for (const file of await collectFiles(destSkillsDir)) {
      deployedFiles.push(`.claude/skills/${file}`);
    }
    for (const file of await collectFiles(destAgentsDir)) {
      deployedFiles.push(`.claude/agents/${file}`);
    }
    deployedFiles.sort();

    const epoch = new Date(0).toISOString();
    const lockLines = [
      `lockfile_version: '1'`,
      `generated_at: '${epoch}'`,
      `pack:`,
      `  format: apm`,
      `  target: claude`,
      `  packed_at: '${epoch}'`,
      `dependencies:`,
      `- repo_url: _local/${packName}`,
      `  version: '${version}'`,
      `  package_type: apm_package`,
      `  depth: 1`,
      `  deployed_files:`,
      ...deployedFiles.map((f) => `  - ${f}`),
      `local_deployed_files: []`,
      ``,
    ];
    await writeFile(
      join(apmDir, "apm.lock.yaml"),
      lockLines.join("\n"),
      "utf-8",
    );
  }

  /** Stage the APM git repo layout from a full staging dir.
   *  Skills live at root; agents live under .apm/agents/ (APM's
   *  canonical source layout for agent discovery and integration).
   */
  async stageApmGit(fullDir, gitDir, packName, version) {
    const srcSkillsDir = join(fullDir, ".claude", "skills");
    const srcAgentsDir = join(fullDir, ".claude", "agents");
    const destSkillsDir = join(gitDir, "skills");
    const destAgentsDir = join(gitDir, ".apm", "agents");

    await mkdir(destSkillsDir, { recursive: true });
    await mkdir(destAgentsDir, { recursive: true });

    const skillDirs = (
      await readdir(srcSkillsDir, { withFileTypes: true })
    ).filter((e) => e.isDirectory());
    for (const dir of skillDirs) {
      await cp(join(srcSkillsDir, dir.name), join(destSkillsDir, dir.name), {
        recursive: true,
      });
    }

    const agentFiles = (await readdir(srcAgentsDir)).filter((f) =>
      f.endsWith(".md"),
    );
    for (const file of agentFiles) {
      await cp(join(srcAgentsDir, file), join(destAgentsDir, file));
    }

    const srcClaudeMd = join(fullDir, ".claude", "CLAUDE.md");
    if (existsSync(srcClaudeMd)) {
      await copyFile(srcClaudeMd, join(gitDir, "CLAUDE.md"));
    }

    const manifestLines = [`name: ${packName}`, `version: '${version}'`, ``];
    await writeFile(join(gitDir, "apm.yml"), manifestLines.join("\n"), "utf-8");
  }

  /** Return the skills subdirectory of a full staging dir. */
  skillsDir(fullDir) {
    return join(fullDir, ".claude", "skills");
  }
}
