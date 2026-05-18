/**
 * Agent builder preview components
 *
 * Preview panel for agent generation. Derives data per discipline/track
 * combination, then assembles a single unified layout with consolidated
 * Agents, Skills, and Toolkit sections.
 */

import { div, h2, h3, p, section } from "../lib/render.js";
import {
  generateAgentProfile,
  generateSkillMarkdown,
  deriveAgentSkills,
  interpolateTeamInstructions,
  renderOrganizationalContext,
} from "@forwardimpact/libskill/agent";
import { deriveToolkit } from "@forwardimpact/libskill/toolkit";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import { formatTeamInstructions } from "../formatters/agent/team-instructions.js";
import {
  formatAgentSkill,
  formatInstallScript,
  formatReference,
} from "../formatters/agent/skill.js";
import { createFileCard } from "../components/file-card.js";
import { createToolkitTable } from "../formatters/toolkit/dom.js";
import { createDetailSection } from "../components/detail.js";

/**
 * Build a file card for a skill with 1-3 file panes (accordion).
 * @param {Object} skill
 * @param {Object} templates
 * @returns {HTMLElement}
 */
function buildSkillFileCard(skill, templates) {
  const content = formatAgentSkill(skill, templates.skill);

  const files = [
    {
      filename: `${skill.dirname}/SKILL.md`,
      content,
      language: "markdown",
    },
  ];

  if (skill.installScript) {
    files.push({
      filename: `${skill.dirname}/scripts/install.sh`,
      content: formatInstallScript(skill, templates.install),
      language: "bash",
    });
  }

  for (const ref of skill.references || []) {
    files.push({
      filename: `${skill.dirname}/references/${ref.name}.md`,
      content: formatReference(ref, templates.reference),
      language: "markdown",
    });
  }

  const headerChildren = [
    p({ className: "file-card-name" }, skill.frontmatter.name),
  ];
  if (files.length > 1) {
    headerChildren.push(
      p({ className: "file-card-badge" }, `${files.length} files`),
    );
  }

  return createFileCard({
    header: headerChildren,
    files,
    maxHeight: 300,
  });
}

/**
 * Derive agent data for a single discipline/track combination.
 * Returns raw data; does not build DOM.
 * @param {Object} context
 * @returns {{profile: Object, skillFiles: Array, toolkit: Array, teamInstructionsContent: string|null}}
 */
export function deriveAgentData(context) {
  const {
    humanDiscipline,
    humanTrack,
    agentDiscipline,
    agentTrack,
    level,
    skills,
    capabilities,
    behaviours,
    agentBehaviours,
    templates,
    organizationalContext,
  } = context;

  const profile = generateAgentProfile({
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills,
    capabilities,
    behaviours,
    agentBehaviours,
    agentDiscipline,
    agentTrack,
  });

  const derivedSkills = deriveAgentSkills({
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills,
    capabilities,
  });

  const skillFiles = derivedSkills
    .map((d) => skills.find((s) => s.id === d.skillId))
    .filter((skill) => skill?.agent)
    .map((skill) => generateSkillMarkdown({ skillData: skill }));

  const toolkit = deriveToolkit({
    skillMatrix: derivedSkills,
    skills,
  });

  const teamInstructions = interpolateTeamInstructions({
    agentTrack,
    humanDiscipline,
  });
  const orgSection = renderOrganizationalContext(organizationalContext);
  const teamInstructionsContent = formatTeamInstructions(
    teamInstructions,
    orgSection,
    templates.claude,
  );

  return { profile, skillFiles, toolkit, teamInstructionsContent };
}

/**
 * Build the unified preview layout from collected agent data.
 * @param {Object} params
 * @param {Array} params.profiles - All agent profiles
 * @param {Array} params.skillFiles - Deduplicated skill files
 * @param {Array} params.toolkit - Deduplicated toolkit entries
 * @param {string|null} params.teamInstructionsContent - Rendered CLAUDE.md
 * @param {Object} params.templates - Mustache templates
 * @param {HTMLElement} params.downloadButton - Download button element
 * @returns {HTMLElement}
 */
export function createTeamPreview({
  profiles,
  skillFiles,
  toolkit,
  teamInstructionsContent,
  templates,
  downloadButton,
}) {
  return div(
    { className: "agent-deployment" },
    downloadButton,
    teamInstructionsContent
      ? section(
          { className: "agent-section" },
          h2({}, "Team Instructions"),
          div(
            { className: "agent-cards-grid single" },
            createFileCard({
              header: [h3({}, "CLAUDE.md")],
              files: [
                {
                  filename: ".claude/CLAUDE.md",
                  content: teamInstructionsContent,
                  language: "markdown",
                },
              ],
              maxHeight: 400,
            }),
          ),
        )
      : null,
    section(
      { className: "agent-section" },
      h2({}, `Agents (${profiles.length})`),
      div(
        {
          className:
            profiles.length === 1
              ? "agent-cards-grid single"
              : "agent-cards-grid",
        },
        ...profiles.map((profile) => {
          const content = formatAgentProfile(profile, templates.agent);
          return createFileCard({
            header: [h3({}, profile.frontmatter.name)],
            files: [
              { filename: profile.filename, content, language: "markdown" },
            ],
            maxHeight: 400,
          });
        }),
      ),
    ),
    section(
      { className: "agent-section" },
      h2({}, `Skills (${skillFiles.length})`),
      skillFiles.length > 0
        ? div(
            { className: "skill-cards-grid" },
            ...skillFiles.map((skill) => buildSkillFileCard(skill, templates)),
          )
        : p(
            { className: "text-muted" },
            "No skills with agent sections found.",
          ),
    ),
    toolkit.length > 0
      ? createDetailSection({
          title: `Tool Kit (${toolkit.length})`,
          content: createToolkitTable(toolkit),
        })
      : null,
  );
}

/**
 * Create help section explaining how agent builder works
 * @returns {HTMLElement}
 */
export function createHelpSection() {
  return section(
    { className: "section section-detail" },
    h2({ className: "section-title" }, "How It Works"),
    div(
      { className: "auto-grid-md" },
      div(
        { className: "detail-item" },
        div({ className: "detail-item-label" }, "Agent Profiles"),
        p(
          {},
          "The .md files contain the agent's identity, skills, and constraints. " +
            "Place them in .claude/agents/ for Claude Code to discover.",
        ),
      ),
      div(
        { className: "detail-item" },
        div({ className: "detail-item-label" }, "Skills"),
        p(
          {},
          "SKILL.md files provide specialized knowledge that agents can use. " +
            "Place them in .claude/skills/{skill-name}/ directories.",
        ),
      ),
      div(
        { className: "detail-item" },
        div({ className: "detail-item-label" }, "Download"),
        p(
          {},
          "Download the complete agent deployment with the agent profile and all skills in one zip file.",
        ),
      ),
    ),
  );
}
