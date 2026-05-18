/**
 * Agent file I/O helpers
 *
 * Handles writing agent profiles, skills, settings, and team instructions
 * to disk. Extracted from agent.js to keep command logic focused.
 */

import { writeFile, mkdir, readFile, rm } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import {
  formatAgentSkill,
  formatInstallScript,
  formatReference,
} from "../formatters/agent/skill.js";
import { formatTeamInstructions } from "../formatters/agent/team-instructions.js";
import { formatSuccess } from "@forwardimpact/libcli";
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("pathway");

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
 * @param {Object} claudeSettings - Settings loaded from data
 */
export async function generateClaudeSettings(baseDir, claudeSettings) {
  const settingsPath = join(baseDir, ".claude", "settings.json");

  let settings = {};
  if (existsSync(settingsPath)) {
    const content = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(content);
  }

  const merged = { ...settings, ...claudeSettings };

  await ensureDir(settingsPath);
  await writeFile(
    settingsPath,
    JSON.stringify(merged, null, 2) + "\n",
    "utf-8",
  );
  logger.info(formatSuccess(`Updated: ${settingsPath}`));
}

/**
 * Generate VS Code settings file
 * Merges with existing settings if file exists
 * @param {string} baseDir - Base output directory
 * @param {Object} vscodeSettings - Settings loaded from data
 */
export async function generateVscodeSettings(baseDir, vscodeSettings) {
  if (!vscodeSettings || Object.keys(vscodeSettings).length === 0) return;

  const settingsPath = join(baseDir, ".vscode", "settings.json");

  let settings = {};
  if (existsSync(settingsPath)) {
    const content = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(content);
  }

  const merged = { ...settings, ...vscodeSettings };

  await ensureDir(settingsPath);
  await writeFile(
    settingsPath,
    JSON.stringify(merged, null, 2) + "\n",
    "utf-8",
  );
  logger.info(formatSuccess(`Updated: ${settingsPath}`));
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
  logger.info(formatSuccess(`Created: ${profilePath}`));
  return profilePath;
}

/**
 * Write team instructions and/or organizational context to CLAUDE.md
 * @param {string|null} teamInstructions - Interpolated team instructions content
 * @param {string|null} orgSection - Rendered organizational context section
 * @param {string} baseDir - Base output directory
 * @param {string} template - Mustache template string for CLAUDE.md
 * @returns {string|null} Path written, or null if skipped
 */
export async function writeTeamInstructions(
  teamInstructions,
  orgSection,
  baseDir,
  template,
) {
  const content = formatTeamInstructions(
    teamInstructions,
    orgSection,
    template,
  );
  if (!content) return null;
  const filePath = join(baseDir, ".claude", "CLAUDE.md");
  await ensureDir(filePath);
  await writeFile(filePath, content, "utf-8");
  logger.info(formatSuccess(`Created: ${filePath}`));
  return filePath;
}

/**
 * Write reference files for a skill, wiping the references/ directory first.
 *
 * The generator owns <skillDir>/references/. Every call removes any existing
 * directory contents before writing, so on-disk state matches YAML exactly
 * even when prior runs produced different filenames.
 *
 * @param {string} skillDir - Skill directory (`.claude/skills/{dirname}`)
 * @param {Array<{name: string, title: string, body: string}>} references
 * @param {string} template - Mustache template for an individual reference file
 * @returns {Promise<number>} Number of reference files written
 */
export async function writeSkillReferences(skillDir, references, template) {
  const refDir = join(skillDir, "references");
  await rm(refDir, { recursive: true, force: true });
  if (!references || references.length === 0) return 0;
  await mkdir(refDir, { recursive: true });
  for (const entry of references) {
    const refPath = join(refDir, `${entry.name}.md`);
    await writeFile(refPath, formatReference(entry, template), "utf-8");
    logger.info(formatSuccess(`Created: ${refPath}`));
  }
  return references.length;
}

/**
 * Write skill files (SKILL.md, scripts/install.sh, references/{name}.md)
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
    logger.info(formatSuccess(`Created: ${skillPath}`));
    fileCount++;

    if (skill.installScript) {
      const installPath = join(skillDir, "scripts", "install.sh");
      const installContent = formatInstallScript(skill, templates.install);
      await ensureDir(installPath);
      await writeFile(installPath, installContent, { mode: 0o755 });
      logger.info(formatSuccess(`Created: ${installPath}`));
      fileCount++;
    }

    fileCount += await writeSkillReferences(
      skillDir,
      skill.references,
      templates.reference,
    );
  }
  return fileCount;
}
