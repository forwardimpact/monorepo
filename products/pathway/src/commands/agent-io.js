/**
 * Agent file I/O helpers
 *
 * Handles writing agent profiles, skills, settings, and team instructions
 * to disk. Extracted from agent.js to keep command logic focused.
 */

import { join, dirname } from "path";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import {
  formatAgentSkill,
  formatInstallScript,
  formatReference,
} from "../formatters/agent/skill.js";
import { formatTeamInstructions } from "../formatters/agent/team-instructions.js";
import { formatSuccess } from "@forwardimpact/libcli";
import { createLogger } from "@forwardimpact/libtelemetry";

/**
 * Async file-existence check over the injected async fs surface. Keeps this
 * module on a single fs surface (async only) per spec § Scope / design
 * Decision 7 instead of reaching for `fsSync.existsSync`.
 * @param {object} fs - The `runtime.fs` collaborator.
 * @param {string} path - Path to test.
 * @returns {Promise<boolean>}
 */
async function pathExists(fs, path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists for a file path
 * @param {string} filePath - Full file path
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators
 */
async function ensureDir(filePath, runtime) {
  await runtime.fs.mkdir(dirname(filePath), { recursive: true });
}

/**
 * Generate Claude Code settings file
 * Merges with existing settings if file exists
 * @param {string} baseDir - Base output directory
 * @param {Object} claudeSettings - Settings loaded from data
 */
export async function generateClaudeSettings(baseDir, claudeSettings, runtime) {
  const logger = createLogger("pathway", runtime);
  const settingsPath = join(baseDir, ".claude", "settings.json");

  let settings = {};
  if (await pathExists(runtime.fs, settingsPath)) {
    const content = await runtime.fs.readFile(settingsPath, "utf-8");
    settings = JSON.parse(content);
  }

  const merged = { ...settings, ...claudeSettings };

  await ensureDir(settingsPath, runtime);
  await runtime.fs.writeFile(
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
export async function generateVscodeSettings(baseDir, vscodeSettings, runtime) {
  const logger = createLogger("pathway", runtime);
  if (!vscodeSettings || Object.keys(vscodeSettings).length === 0) return;

  const settingsPath = join(baseDir, ".vscode", "settings.json");

  let settings = {};
  if (await pathExists(runtime.fs, settingsPath)) {
    const content = await runtime.fs.readFile(settingsPath, "utf-8");
    settings = JSON.parse(content);
  }

  const merged = { ...settings, ...vscodeSettings };

  await ensureDir(settingsPath, runtime);
  await runtime.fs.writeFile(
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
export async function writeProfile(profile, baseDir, template, runtime) {
  const logger = createLogger("pathway", runtime);
  const profilePath = join(baseDir, ".claude", "agents", profile.filename);
  const profileContent = formatAgentProfile(profile, template);
  await ensureDir(profilePath, runtime);
  await runtime.fs.writeFile(profilePath, profileContent, "utf-8");
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
  runtime,
) {
  const logger = createLogger("pathway", runtime);
  const content = formatTeamInstructions(
    teamInstructions,
    orgSection,
    template,
  );
  if (!content) return null;
  const filePath = join(baseDir, ".claude", "CLAUDE.md");
  // Exporting several agents into one --output directory makes them share this
  // single CLAUDE.md. That is fine when their team instructions match, but a
  // silent overwrite would lose differing content (e.g. per-track teams). Warn
  // rather than clobber quietly.
  if (await pathExists(runtime.fs, filePath)) {
    const existing = await runtime.fs.readFile(filePath, "utf-8");
    if (existing !== content) {
      logger.warn(
        `Overwriting ${filePath} with different team instructions — ` +
          `exporting agents with distinct team content into one directory ` +
          `loses all but the last. Use separate --output directories.`,
      );
    }
  }
  await ensureDir(filePath, runtime);
  await runtime.fs.writeFile(filePath, content, "utf-8");
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
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators
 * @returns {Promise<number>} Number of reference files written
 */
export async function writeSkillReferences(
  skillDir,
  references,
  template,
  runtime,
) {
  const logger = createLogger("pathway", runtime);
  const refDir = join(skillDir, "references");
  await runtime.fs.rm(refDir, { recursive: true, force: true });
  if (!references || references.length === 0) return 0;
  await runtime.fs.mkdir(refDir, { recursive: true });
  for (const entry of references) {
    const refPath = join(refDir, `${entry.name}.md`);
    await runtime.fs.writeFile(
      refPath,
      formatReference(entry, template),
      "utf-8",
    );
    logger.info(formatSuccess(`Created: ${refPath}`));
  }
  return references.length;
}

/**
 * Write skill files (SKILL.md, scripts/install.sh, references/{name}.md)
 * @param {Array} skills - Generated skills
 * @param {string} baseDir - Base output directory
 * @param {Object} templates - Templates object with skill, install, reference
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators
 */
export async function writeSkills(skills, baseDir, templates, runtime) {
  const logger = createLogger("pathway", runtime);
  let fileCount = 0;
  for (const skill of skills) {
    const skillDir = join(baseDir, ".claude", "skills", skill.dirname);

    const skillPath = join(skillDir, "SKILL.md");
    const skillContent = formatAgentSkill(skill, templates.skill);
    await ensureDir(skillPath, runtime);
    await runtime.fs.writeFile(skillPath, skillContent, "utf-8");
    logger.info(formatSuccess(`Created: ${skillPath}`));
    fileCount++;

    if (skill.installScript) {
      const installPath = join(skillDir, "scripts", "install.sh");
      const installContent = formatInstallScript(skill, templates.install);
      await ensureDir(installPath, runtime);
      await runtime.fs.writeFile(installPath, installContent, { mode: 0o755 });
      logger.info(formatSuccess(`Created: ${installPath}`));
      fileCount++;
    }

    fileCount += await writeSkillReferences(
      skillDir,
      skill.references,
      templates.reference,
      runtime,
    );
  }
  return fileCount;
}
