/**
 * Agent file I/O helpers
 *
 * Handles writing agent profiles, skills, settings, and team instructions
 * to disk. Extracted from agent.js to keep command logic focused.
 */

import { writeFile, mkdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import {
  formatAgentSkill,
  formatInstallScript,
  formatReference,
} from "../formatters/agent/skill.js";
import { formatSuccess } from "../lib/cli-output.js";

/**
 * Ensure directory exists for a file path
 * @param {string} filePath - Full file path
 */
async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

/**
 * Generate Claude Code settings file
 * Merges with existing settings if file exists
 * @param {string} baseDir - Base output directory
 * @param {Object} claudeCodeSettings - Settings loaded from data
 */
export async function generateClaudeCodeSettings(baseDir, claudeCodeSettings) {
  const settingsPath = join(baseDir, ".claude", "settings.json");

  let settings = {};
  if (existsSync(settingsPath)) {
    const content = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(content);
  }

  const merged = { ...settings, ...claudeCodeSettings };

  await ensureDir(settingsPath);
  await writeFile(
    settingsPath,
    JSON.stringify(merged, null, 2) + "\n",
    "utf-8",
  );
  console.log(formatSuccess(`Updated: ${settingsPath}`));
}

/**
 * Write agent profile to file
 * @param {Object} profile - Generated profile
 * @param {string} baseDir - Base output directory
 * @param {string} template - Mustache template for agent profile
 */
export async function writeProfile(profile, baseDir, template) {
  const profilePath = join(baseDir, ".claude", "agents", profile.filename);
  const profileContent = formatAgentProfile(profile, template);
  await ensureDir(profilePath);
  await writeFile(profilePath, profileContent, "utf-8");
  console.log(formatSuccess(`Created: ${profilePath}`));
  return profilePath;
}

/**
 * Write team instructions to CLAUDE.md
 * @param {string|null} teamInstructions - Interpolated team instructions content
 * @param {string} baseDir - Base output directory
 * @returns {string|null} Path written, or null if skipped
 */
export async function writeTeamInstructions(teamInstructions, baseDir) {
  if (!teamInstructions) return null;
  const filePath = join(baseDir, ".claude", "CLAUDE.md");
  await ensureDir(filePath);
  await writeFile(filePath, teamInstructions.trim() + "\n", "utf-8");
  console.log(formatSuccess(`Created: ${filePath}`));
  return filePath;
}

/**
 * Write skill files (SKILL.md, scripts/install.sh, references/REFERENCE.md)
 * @param {Array} skills - Generated skills
 * @param {string} baseDir - Base output directory
 * @param {Object} templates - Templates object with skill, install, reference
 */
export async function writeSkills(skills, baseDir, templates) {
  let fileCount = 0;
  for (const skill of skills) {
    const skillDir = join(baseDir, ".claude", "skills", skill.dirname);

    const skillPath = join(skillDir, "SKILL.md");
    const skillContent = formatAgentSkill(skill, templates.skill);
    await ensureDir(skillPath);
    await writeFile(skillPath, skillContent, "utf-8");
    console.log(formatSuccess(`Created: ${skillPath}`));
    fileCount++;

    if (skill.installScript) {
      const installPath = join(skillDir, "scripts", "install.sh");
      const installContent = formatInstallScript(skill, templates.install);
      await ensureDir(installPath);
      await writeFile(installPath, installContent, { mode: 0o755 });
      console.log(formatSuccess(`Created: ${installPath}`));
      fileCount++;
    }

    if (skill.implementationReference) {
      const refPath = join(skillDir, "references", "REFERENCE.md");
      const refContent = formatReference(skill, templates.reference);
      await ensureDir(refPath);
      await writeFile(refPath, refContent, "utf-8");
      console.log(formatSuccess(`Created: ${refPath}`));
      fileCount++;
    }
  }
  return fileCount;
}
