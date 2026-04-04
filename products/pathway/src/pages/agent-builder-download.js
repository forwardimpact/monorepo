/**
 * Download button components for agent builder page
 */

import { formatAgentProfile } from "../formatters/agent/profile.js";
import {
  formatAgentSkill,
  formatInstallScript,
  formatReference,
} from "../formatters/agent/skill.js";

/**
 * Dynamically import JSZip from CDN
 * @returns {Promise<typeof JSZip>}
 */
async function importJSZip() {
  const module = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  return module.default;
}

/**
 * Add skill files to a zip archive
 * @param {Object} zip - JSZip instance
 * @param {Array} skillFiles - Skill file objects
 * @param {Object} templates - Templates object
 */
function addSkillsToZip(zip, skillFiles, templates) {
  for (const skill of skillFiles) {
    const content = formatAgentSkill(skill, templates.skill);
    zip.file(`.claude/skills/${skill.dirname}/SKILL.md`, content);

    if (skill.installScript) {
      const installContent = formatInstallScript(skill, templates.install);
      zip.file(
        `.claude/skills/${skill.dirname}/scripts/install.sh`,
        installContent,
        { unixPermissions: "755" },
      );
    }

    if (skill.implementationReference) {
      const refContent = formatReference(skill, templates.reference);
      zip.file(
        `.claude/skills/${skill.dirname}/references/REFERENCE.md`,
        refContent,
      );
    }
  }
}

/**
 * Add Claude Code settings to a zip archive
 * @param {Object} zip - JSZip instance
 * @param {Object} claudeCodeSettings
 */
function addSettingsToZip(zip, claudeCodeSettings) {
  if (Object.keys(claudeCodeSettings).length > 0) {
    zip.file(
      ".claude/settings.json",
      JSON.stringify(claudeCodeSettings, null, 2) + "\n",
    );
  }
}

/**
 * Trigger a browser download of a blob
 * @param {Blob} blob
 * @param {string} filename
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Create download all button for all stages
 * @param {Array} stageAgents - Array of {stage, derived, profile}
 * @param {Array} skillFiles - Array of skill file objects
 * @param {Object} claudeCodeSettings - Claude Code settings
 * @param {Object} context - Context with discipline/track info and templates
 * @returns {HTMLElement}
 */
export function createDownloadAllButton(
  stageAgents,
  skillFiles,
  claudeCodeSettings,
  context,
) {
  const { humanDiscipline, humanTrack, templates } = context;
  const agentName = `${humanDiscipline.id}-${humanTrack.id}`.replace(/_/g, "-");

  const btn = document.createElement("button");
  btn.className = "btn btn-primary download-all-btn";
  btn.textContent = "📦 Download All (.zip)";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Generating...";

    try {
      const JSZip = await importJSZip();
      const zip = new JSZip();

      for (const { profile } of stageAgents) {
        const content = formatAgentProfile(profile, templates.agent);
        zip.file(`.claude/agents/${profile.filename}`, content);
      }

      addSkillsToZip(zip, skillFiles, templates);
      addSettingsToZip(zip, claudeCodeSettings);

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `${agentName}-agents.zip`);
    } finally {
      btn.disabled = false;
      btn.textContent = "📦 Download All (.zip)";
    }
  });

  return btn;
}

/**
 * Create download button for single stage
 * @param {Object} profile - Agent profile
 * @param {Array} skillFiles - Skill files
 * @param {Object} claudeCodeSettings - Claude Code settings
 * @param {{agent: string, skill: string}} templates - Mustache templates
 * @returns {HTMLElement}
 */
export function createDownloadSingleButton(
  profile,
  skillFiles,
  claudeCodeSettings,
  templates,
) {
  const btn = document.createElement("button");
  btn.className = "btn btn-primary download-all-btn";
  btn.textContent = "📥 Download Agent (.zip)";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Generating...";

    try {
      const JSZip = await importJSZip();
      const zip = new JSZip();

      const content = formatAgentProfile(profile, templates.agent);
      zip.file(`.claude/agents/${profile.filename}`, content);

      addSkillsToZip(zip, skillFiles, templates);
      addSettingsToZip(zip, claudeCodeSettings);

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `${profile.frontmatter.name}-agent.zip`);
    } finally {
      btn.disabled = false;
      btn.textContent = "📥 Download Agent (.zip)";
    }
  });

  return btn;
}
