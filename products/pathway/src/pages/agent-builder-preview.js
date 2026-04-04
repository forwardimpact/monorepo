/**
 * Agent builder preview components
 *
 * Preview panels for all-stages and single-stage agent generation.
 */

import { div, h2, h3, p, span, section } from "../lib/render.js";
import {
  generateStageAgentProfile,
  deriveStageAgent,
  generateSkillMarkdown,
  deriveAgentSkills,
  deriveToolkit,
} from "@forwardimpact/libskill";
import { getStageEmoji } from "../formatters/stage/shared.js";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import {
  formatAgentSkill,
  formatInstallScript,
  formatReference,
} from "../formatters/agent/skill.js";
import { createFileCard } from "../components/file-card.js";
import { createToolkitTable } from "../formatters/toolkit/dom.js";
import { createDetailSection } from "../components/detail.js";
import {
  createDownloadAllButton,
  createDownloadSingleButton,
} from "./agent-builder-download.js";

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

  if (skill.implementationReference) {
    files.push({
      filename: `${skill.dirname}/references/REFERENCE.md`,
      content: formatReference(skill, templates.reference),
      language: "markdown",
    });
  }

  const headerChildren = [
    span({ className: "file-card-name" }, skill.frontmatter.name),
  ];
  if (files.length > 1) {
    headerChildren.push(
      span({ className: "file-card-badge" }, `${files.length} files`),
    );
  }

  return createFileCard({
    header: headerChildren,
    files,
    maxHeight: 300,
  });
}

/**
 * Create a skills section for the preview
 * @param {Array} skillFiles
 * @param {Object} templates
 * @returns {HTMLElement}
 */
function createSkillsSection(skillFiles, templates) {
  return section(
    { className: "agent-section" },
    h2({}, `Skills (${skillFiles.length})`),
    skillFiles.length > 0
      ? div(
          { className: "skill-cards-grid" },
          ...skillFiles.map((skill) => buildSkillFileCard(skill, templates)),
        )
      : p(
          { className: "text-muted" },
          "No skills with agent sections found for this discipline.",
        ),
  );
}

/**
 * Derive skill files and toolkit from context
 * @param {Object} context
 * @returns {{derivedSkills: Array, skillFiles: Array, toolkit: Array}}
 */
function deriveSkillData(context) {
  const { humanDiscipline, humanTrack, level, skills, stages } = context;
  const derivedSkills = deriveAgentSkills({
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills,
  });

  const skillFiles = derivedSkills
    .map((d) => skills.find((s) => s.id === d.skillId))
    .filter((skill) => skill?.agent)
    .map((skill) => generateSkillMarkdown(skill, stages));

  const toolkit = deriveToolkit({
    skillMatrix: derivedSkills,
    skills,
  });

  return { derivedSkills, skillFiles, toolkit };
}

/**
 * Create preview for all stages
 * @param {Object} context
 * @returns {HTMLElement}
 */
export function createAllStagesPreview(context) {
  const {
    humanDiscipline,
    humanTrack,
    agentDiscipline,
    agentTrack,
    level,
    stages,
    skills,
    behaviours,
    agentBehaviours,
    claudeCodeSettings,
    templates,
  } = context;

  const stageAgents = stages.map((stage) => {
    const derived = deriveStageAgent({
      discipline: humanDiscipline,
      track: humanTrack,
      stage,
      level,
      skills,
      behaviours,
      agentBehaviours,
      agentDiscipline,
      agentTrack,
    });

    const profile = generateStageAgentProfile({
      discipline: humanDiscipline,
      track: humanTrack,
      stage,
      level,
      skills,
      behaviours,
      agentBehaviours,
      agentDiscipline,
      agentTrack,
      stages,
    });

    return { stage, derived, profile };
  });

  const { skillFiles, toolkit } = deriveSkillData(context);

  return div(
    { className: "agent-deployment" },
    createDownloadAllButton(
      stageAgents,
      skillFiles,
      claudeCodeSettings,
      context,
    ),
    section(
      { className: "agent-section" },
      h2({}, `Agents (${stageAgents.length})`),
      p(
        { className: "text-muted" },
        "Stage-specific agents with skills, constraints, and stage transitions.",
      ),
      div(
        { className: "agent-cards-grid" },
        ...stageAgents.map(({ stage, profile }) => {
          const content = formatAgentProfile(profile, templates.agent);
          const stageEmoji = getStageEmoji(stages, stage.id);
          return createFileCard({
            header: [
              span({ className: "file-card-emoji" }, stageEmoji),
              h3({}, `${stage.name} Agent`),
            ],
            files: [
              { filename: profile.filename, content, language: "markdown" },
            ],
            maxHeight: 400,
          });
        }),
      ),
    ),
    createSkillsSection(skillFiles, templates),
    toolkit.length > 0
      ? createDetailSection({
          title: `Tool Kit (${toolkit.length})`,
          content: createToolkitTable(toolkit),
        })
      : null,
  );
}

/**
 * Create preview for a single stage
 * @param {Object} context
 * @param {Object} stage
 * @returns {HTMLElement}
 */
export function createSingleStagePreview(context, stage) {
  const {
    humanDiscipline,
    humanTrack,
    agentDiscipline,
    agentTrack,
    level,
    skills,
    behaviours,
    agentBehaviours,
    claudeCodeSettings,
    stages,
    templates,
  } = context;

  const profile = generateStageAgentProfile({
    discipline: humanDiscipline,
    track: humanTrack,
    stage,
    level,
    skills,
    behaviours,
    agentBehaviours,
    agentDiscipline,
    agentTrack,
    stages,
  });

  const { skillFiles, toolkit } = deriveSkillData(context);

  return div(
    { className: "agent-deployment" },
    createDownloadSingleButton(
      profile,
      skillFiles,
      claudeCodeSettings,
      templates,
    ),
    section(
      { className: "agent-section" },
      h2({}, "Agent"),
      div(
        { className: "agent-cards-grid single" },
        (() => {
          const content = formatAgentProfile(profile, templates.agent);
          const stageEmoji = getStageEmoji(stages, stage.id);
          return createFileCard({
            header: [
              span({ className: "file-card-emoji" }, stageEmoji),
              h3({}, `${stage.name} Agent`),
            ],
            files: [
              { filename: profile.filename, content, language: "markdown" },
            ],
            maxHeight: 400,
          });
        })(),
      ),
    ),
    createSkillsSection(skillFiles, templates),
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
        div({ className: "detail-item-label" }, "Stages"),
        p(
          {},
          "Agents are generated for each stage: Plan (research), Code (implement), and Review (verify). " +
            "Each stage has specific skills, constraints, and stage transitions.",
        ),
      ),
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
        div({ className: "detail-item-label" }, "All Stages"),
        p(
          {},
          "Select 'All Stages' to download a complete agent deployment with all stage agents and skills in one zip file.",
        ),
      ),
    ),
  );
}
