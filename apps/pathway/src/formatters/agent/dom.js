/**
 * Agent DOM Formatter
 *
 * Formats agent deployment data into DOM elements for browser display.
 * Includes copy and download functionality.
 */

import { div, h2, h3, p, span, button, section } from "../../lib/render.js";
import { createCodeDisplay } from "../../components/code-display.js";
import { formatAgentProfile } from "./profile.js";
import { formatAgentSkill } from "./skill.js";
import { getStageEmoji } from "../stage/shared.js";

/**
 * Convert agent deployment to DOM elements
 * @param {Object} deployment - Generated deployment
 * @param {Object} deployment.profile - Agent profile
 * @param {Array} deployment.skills - Agent skills
 * @param {Array} [deployment.roleAgents] - Role variant agents (plan, review)
 * @param {Object} [deployment.vscodeSettings] - VS Code settings to include in download
 * @returns {HTMLElement}
 */
export function agentDeploymentToDOM({
  profile,
  skills,
  roleAgents = [],
  vscodeSettings = {},
}) {
  const profileContent = formatAgentProfile(profile);
  const agentName = profile.frontmatter.name;

  return div(
    { className: "agent-deployment" },

    // Download all button
    createDownloadButton(
      profile,
      skills,
      roleAgents,
      vscodeSettings,
      agentName,
    ),

    // Profile section
    section(
      { className: "agent-section" },
      h2({}, "Agent Profile"),
      createCodeDisplay({
        content: profileContent,
        filename: profile.filename,
        maxHeight: 600,
      }),
    ),

    // Role Agents section
    roleAgents.length > 0
      ? section(
          { className: "agent-section" },
          h2({}, `Role Variants (${roleAgents.length})`),
          p(
            { className: "text-muted" },
            "Specialized agents for specific workflow phases. These can be used as subagents or standalone.",
          ),
          div(
            { className: "role-agents-list" },
            ...roleAgents.map((agent) => createRoleAgentCard(agent)),
          ),
        )
      : null,

    // Skills section
    section(
      { className: "agent-section" },
      h2({}, `Skills (${skills.length})`),
      skills.length > 0
        ? div(
            { className: "skills-list" },
            ...skills.map((skill) => createSkillCard(skill)),
          )
        : p(
            { className: "text-muted" },
            "No skills with agent sections found for this discipline.",
          ),
    ),
  );
}

/**
 * Create download all button
 * @param {Object} profile - Agent profile
 * @param {Array} skills - Agent skills
 * @param {Array} roleAgents - Role variant agents
 * @param {Object} vscodeSettings - VS Code settings to include
 * @param {string} agentName - Agent name for zip filename
 * @returns {HTMLElement}
 */
function createDownloadButton(
  profile,
  skills,
  roleAgents,
  vscodeSettings,
  agentName,
) {
  const btn = button(
    { className: "btn btn-primary download-all-btn" },
    "📦 Download All (.zip)",
  );

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Generating...";

    try {
      await downloadAllAsZip(
        profile,
        skills,
        roleAgents,
        vscodeSettings,
        agentName,
      );
    } finally {
      btn.disabled = false;
      btn.textContent = "📦 Download All (.zip)";
    }
  });

  return btn;
}

/**
 * Create a skill card with content and copy button
 * @param {Object} skill - Skill with frontmatter and body
 * @returns {HTMLElement}
 */
function createSkillCard(skill) {
  const content = formatAgentSkill(skill);
  const filename = `${skill.dirname}/SKILL.md`;

  return div(
    { className: "skill-card" },
    createCodeDisplay({
      content,
      filename,
      maxHeight: 300,
    }),
  );
}

/**
 * Create a role agent card with collapsible content
 * @param {Object} agent - Role agent with frontmatter, body, filename
 * @returns {HTMLElement}
 */
function createRoleAgentCard(agent) {
  const content = formatAgentProfile(agent);

  return createCodeDisplay({
    content,
    filename: agent.filename,
    description: agent.frontmatter.description,
    maxHeight: 400,
  });
}

/**
 * Download all agent files as a ZIP
 * @param {Object} profile - Agent profile
 * @param {Array} skills - Agent skills
 * @param {Array} roleAgents - Role variant agents
 * @param {Object} vscodeSettings - VS Code settings to include
 * @param {string} agentName - Agent name for zip filename
 */
async function downloadAllAsZip(
  profile,
  skills,
  roleAgents,
  vscodeSettings,
  agentName,
) {
  // Dynamically import JSZip
  const JSZip = await importJSZip();
  const zip = new JSZip();

  // Add main profile to .github/agents/ folder
  const profileContent = formatAgentProfile(profile);
  zip.file(`.github/agents/${profile.filename}`, profileContent);

  // Add role agent profiles to .github/agents/ folder
  for (const roleAgent of roleAgents) {
    const roleContent = formatAgentProfile(roleAgent);
    zip.file(`.github/agents/${roleAgent.filename}`, roleContent);
  }

  // Add skills to .claude/skills/ folder
  for (const skill of skills) {
    const skillContent = formatAgentSkill(skill);
    zip.file(`.claude/skills/${skill.dirname}/SKILL.md`, skillContent);
  }

  // Add VS Code settings for multi-agent features
  if (Object.keys(vscodeSettings).length > 0) {
    zip.file(
      ".vscode/settings.json",
      JSON.stringify(vscodeSettings, null, 2) + "\n",
    );
  }

  // Generate and download
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${agentName}-agent.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Dynamically import JSZip from CDN
 * @returns {Promise<typeof JSZip>}
 */
async function importJSZip() {
  // Use dynamic import from CDN
  const module = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  return module.default;
}

/**
 * Format a stage-specific agent preview
 * @param {Object} stageAgent - Derived stage agent data
 * @param {Object} profile - Generated profile with frontmatter and body
 * @param {Object} options - Options
 * @param {Array} [options.stages] - All stages for emoji lookup
 * @param {Object} [options.vscodeSettings] - VS Code settings for download
 * @returns {HTMLElement}
 */
export function stageAgentToDOM(stageAgent, profile, options = {}) {
  const { vscodeSettings = {}, stages = [] } = options;
  const { stage, tools, handoffs, constraints, checklist, derivedSkills } =
    stageAgent;
  const stageEmoji = getStageEmoji(stages, stage.id);
  const profileContent = formatAgentProfile(profile);

  return div(
    { className: "agent-deployment stage-agent-preview" },

    // Stage info header
    section(
      { className: "agent-section stage-info" },
      div(
        { className: "stage-header" },
        span({ className: "stage-emoji" }, stageEmoji),
        h2({}, `${stage.name} Agent`),
      ),
      p({ className: "text-muted" }, stage.description),
    ),

    // Tools section
    tools.length > 0
      ? section(
          { className: "agent-section" },
          h3({}, "Tools"),
          div(
            { className: "tool-badges" },
            ...tools.map((tool) =>
              span({ className: "badge badge-tool" }, tool),
            ),
          ),
        )
      : null,

    // Constraints section
    constraints.length > 0
      ? section(
          { className: "agent-section" },
          h3({}, "Constraints"),
          div(
            { className: "constraint-list" },
            ...constraints.map((c) =>
              div({ className: "constraint-item" }, `⚠️ ${c}`),
            ),
          ),
        )
      : null,

    // Handoffs section
    handoffs.length > 0
      ? section(
          { className: "agent-section" },
          h3({}, "Handoffs"),
          div(
            { className: "handoff-buttons" },
            ...handoffs.map((h) => {
              const targetEmoji = getStageEmoji(stages, h.target);
              return div(
                { className: "handoff-button-preview" },
                span({ className: "handoff-icon" }, targetEmoji),
                span({ className: "handoff-label" }, h.label),
              );
            }),
          ),
        )
      : null,

    // Checklist section
    checklist.length > 0
      ? section(
          { className: "agent-section" },
          h3({}, "Handoff Checklist"),
          p(
            { className: "text-muted" },
            "Items to verify before transitioning to the next stage.",
          ),
          createChecklistPreview(checklist),
        )
      : null,

    // Skills summary
    derivedSkills.length > 0
      ? section(
          { className: "agent-section" },
          h3({}, `Derived Skills (${derivedSkills.length})`),
          div(
            { className: "skill-badges" },
            ...derivedSkills
              .slice(0, 8)
              .map((skill) =>
                span({ className: "badge badge-default" }, skill.name),
              ),
            derivedSkills.length > 8
              ? span(
                  { className: "text-muted" },
                  ` +${derivedSkills.length - 8} more`,
                )
              : null,
          ),
        )
      : null,

    // Profile section
    section(
      { className: "agent-section" },
      h3({}, "Agent Profile"),
      createCodeDisplay({
        content: profileContent,
        filename: profile.filename,
        maxHeight: 600,
      }),
    ),

    // Download button
    createStageAgentDownloadButton(profile, vscodeSettings),
  );
}

/**
 * Create checklist preview grouped by capability
 * @param {Array} checklist - Checklist items with capability and items
 * @returns {HTMLElement}
 */
function createChecklistPreview(checklist) {
  return div(
    { className: "checklist-preview" },
    ...checklist.map((group) =>
      div(
        { className: "checklist-group" },
        div({ className: "checklist-capability" }, group.capability),
        div(
          { className: "checklist-items" },
          ...group.items.map((item) =>
            div(
              { className: "checklist-item" },
              span({ className: "checklist-checkbox" }, "☐"),
              span({}, item),
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * Create download button for stage agent
 * @param {Object} profile - Agent profile
 * @param {Object} vscodeSettings - VS Code settings
 * @returns {HTMLElement}
 */
function createStageAgentDownloadButton(profile, vscodeSettings) {
  const btn = button(
    { className: "btn btn-primary download-all-btn" },
    "📥 Download Agent Profile",
  );

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Generating...";

    try {
      const JSZip = await importJSZip();
      const zip = new JSZip();

      // Add profile
      const profileContent = formatAgentProfile(profile);
      zip.file(`.github/agents/${profile.filename}`, profileContent);

      // Add VS Code settings
      if (Object.keys(vscodeSettings).length > 0) {
        zip.file(
          ".vscode/settings.json",
          JSON.stringify(vscodeSettings, null, 2) + "\n",
        );
      }

      // Generate and download
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `${profile.frontmatter.name}-agent.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } finally {
      btn.disabled = false;
      btn.textContent = "📥 Download Agent Profile";
    }
  });

  return btn;
}
