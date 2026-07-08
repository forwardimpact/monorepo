/**
 * Agent Generation Model
 *
 * Pure functions for generating AI coding agent configurations
 * from Engineering Pathway data. Outputs follow the Claude Code agent
 * specification:
 * - Agent Profiles (.md files in .claude/agents/)
 * - Agent Skills (SKILL.md files in .claude/skills/)
 *
 * Agent profiles are derived using the SAME modifier logic as human job profiles.
 * Emphasized behaviours and skills (those with positive modifiers) drive agent
 * identity, creating distinct profiles for each discipline x track combination.
 */

import { deriveSkillMatrix, deriveBehaviourProfile } from "./derivation.js";

import {
  filterAgentSkills,
  sortAgentSkills,
  sortAgentBehaviours,
  focusAgentSkills,
} from "./policies/composed.js";
import { LIMIT_AGENT_WORKING_STYLES } from "./policies/thresholds.js";
import { SkillProficiency } from "./levels.js";

/**
 * Derive the reference level for agent generation.
 *
 * The reference level determines the skill and behaviour expectations for agents.
 * We select the first level where core skills reach "practitioner" level,
 * as this represents substantive senior-level expertise suitable for AI agents.
 *
 * @param {Array<Object>} levels - Array of level definitions
 * @returns {Object} The reference level
 * @throws {Error} If no levels are provided
 */
export function deriveReferenceLevel(levels) {
  if (!levels || levels.length === 0) {
    throw new Error("No levels configured");
  }

  const sorted = [...levels].sort((a, b) => a.ordinalRank - b.ordinalRank);

  const practitionerLevel = sorted.find(
    (g) => g.baseSkillProficiencies?.core === SkillProficiency.PRACTITIONER,
  );
  if (practitionerLevel) return practitionerLevel;

  const workingLevel = sorted.find(
    (g) => g.baseSkillProficiencies?.core === SkillProficiency.WORKING,
  );
  if (workingLevel) return workingLevel;

  const middleIndex = Math.floor(sorted.length / 2);
  return sorted[middleIndex];
}

/**
 * Discipline ID to abbreviation mapping for file naming
 * @type {Object.<string, string>}
 */
const DISCIPLINE_ABBREVIATIONS = {
  "software-engineering": "se",
  "data-engineering": "de",
  "data-science": "ds",
};

/**
 * Get abbreviation for a discipline ID
 * @param {string} disciplineId - Discipline identifier
 * @returns {string} Short form abbreviation
 */
export function getDisciplineAbbreviation(disciplineId) {
  return DISCIPLINE_ABBREVIATIONS[disciplineId] || disciplineId.slice(0, 2);
}

/**
 * Convert snake_case id to kebab-case for agent naming
 * @param {string} id - Snake case identifier
 * @returns {string} Kebab case identifier
 */
export function toKebabCase(id) {
  return id.replace(/_/g, "-");
}

/**
 * Derive agent skills using the unified profile system
 * @param {Object} params - Parameters
 * @param {Object} params.discipline - Human discipline definition
 * @param {Object} params.track - Human track definition
 * @param {Object} params.level - Reference level for derivation
 * @param {Array} params.skills - All available skills
 * @returns {Array} Skills sorted by derived level (highest first)
 */
export function deriveAgentSkills({
  discipline,
  track,
  level,
  skills,
  capabilities = [],
}) {
  const skillMatrix = deriveSkillMatrix({
    discipline,
    level,
    track,
    skills,
    capabilities,
  });
  const filtered = filterAgentSkills(skillMatrix);
  return sortAgentSkills(filtered);
}

/**
 * Derive agent behaviours using the unified profile system
 * @param {Object} params - Parameters
 * @param {Object} params.discipline - Human discipline definition
 * @param {Object} params.track - Human track definition
 * @param {Object} params.level - Reference level for derivation
 * @param {Array} params.behaviours - All available behaviours
 * @returns {Array} Behaviours sorted by derived maturity (highest first)
 */
export function deriveAgentBehaviours({
  discipline,
  track,
  level,
  behaviours,
}) {
  const profile = deriveBehaviourProfile({
    discipline,
    level,
    track,
    behaviours,
  });
  return sortAgentBehaviours(profile);
}

/**
 * Build a structured data object for a SKILL.md from skill data (frontmatter, title, focus, checklists); does not render markdown.
 * @param {Object} params - Parameters
 * @param {Object} params.skillData - Skill with agent section
 * @returns {Object} Structured skill data with frontmatter, title, focus, checklists, etc.
 */
export function generateSkillMarkdown({ skillData }) {
  const { agent, id, name } = skillData;

  if (!agent) {
    throw new Error(`Skill ${id} has no agent section`);
  }
  // The skill id IS the agent skill name and the SKILL.md directory name
  // (since skill.agent.name was removed). A skill without an id cannot produce
  // a valid SKILL.md frontmatter `name` or a directory — fail loudly here
  // rather than emitting an empty `name:` and crashing downstream in the packer.
  if (!id) {
    throw new Error(
      `Skill "${name ?? "(unnamed)"}" has no id; cannot derive its agent skill name`,
    );
  }

  return {
    frontmatter: {
      name: id,
      description: agent.description,
      useWhen: agent.useWhen || "",
    },
    title: name,
    focus: agent.focus,
    readChecklist: agent.readChecklist || [],
    confirmChecklist: agent.confirmChecklist || [],
    instructions: skillData.instructions || "",
    installScript: skillData.installScript || "",
    references: skillData.references || [],
    toolReferences: skillData.toolReferences || [],
    dirname: id,
  };
}

/**
 * Lowercase the first character of a string
 * @param {string} s
 * @returns {string}
 */
const lcFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * Substitute template variables in text
 * @param {string} text - Text with {roleTitle}, {specialization} placeholders
 * @param {Object} discipline - Discipline with roleTitle, specialization properties
 * @returns {string} Text with substituted values
 */
function substituteTemplateVars(text, discipline) {
  return text
    .replace(/\{roleTitle\}/g, discipline.roleTitle)
    .replace(/\{specialization\}/g, discipline.specialization);
}

/**
 * Find an agent behaviour by id
 * @param {Array} agentBehaviours - Array of agent behaviour definitions
 * @param {string} id - Behaviour id to find
 * @returns {Object|undefined} Agent behaviour or undefined
 */
function findAgentBehaviour(agentBehaviours, id) {
  return agentBehaviours.find((b) => b.id === id);
}

/**
 * Build working style entries from emphasized behaviours
 * @param {Array} derivedBehaviours - Behaviours sorted by maturity (highest first)
 * @param {Array} agentBehaviours - Agent behaviour definitions with principles
 * @param {number} topN - Number of top behaviours to include
 * @returns {Array} Array of working style entries
 */
function buildWorkingStyleFromBehaviours(
  derivedBehaviours,
  agentBehaviours,
  topN = LIMIT_AGENT_WORKING_STYLES,
) {
  const entries = [];
  const topBehaviours = derivedBehaviours.slice(0, topN);

  for (const derived of topBehaviours) {
    const agentBehaviour = findAgentBehaviour(
      agentBehaviours,
      derived.behaviourId,
    );
    if (!agentBehaviour) continue;
    if (!agentBehaviour.workingStyle && !agentBehaviour.principles) continue;

    const title = agentBehaviour.title || derived.behaviourName;
    const content = agentBehaviour.workingStyle
      ? agentBehaviour.workingStyle.trim()
      : agentBehaviour.principles.trim();

    entries.push({ title, content });
  }

  return entries;
}

/**
 * Interpolate a raw template string if present, otherwise return null.
 */
function interpolateOrNull(raw, discipline) {
  return raw ? substituteTemplateVars(raw, discipline) : null;
}

/**
 * Build skill index from focused skills and all skills
 */
function buildSkillIndex(focusedSkills, skills) {
  return focusedSkills
    .map((derived) => {
      const skill = skills.find((s) => s.id === derived.skillId);
      if (!skill?.agent) return null;
      return {
        name: derived.skillName,
        dirname: skill.id,
        useWhen: lcFirst(skill.agent.useWhen?.trim() || ""),
      };
    })
    .filter(Boolean);
}

/**
 * Build the profile body data for a discipline/track agent
 */
function trimOrNull(value) {
  return typeof value === "string" ? value.trim() : null;
}

function buildProfileBodyData({
  discipline,
  track,
  hasTrack,
  focusedSkills,
  derivedBehaviours,
  agentBehaviours,
  agentDiscipline,
  agentTrack,
  skills,
}) {
  const specialization = discipline.specialization || discipline.name;
  const identity = substituteTemplateVars(
    agentTrack?.identity || agentDiscipline.identity,
    discipline,
  );
  const priority = interpolateOrNull(
    agentTrack?.priority || agentDiscipline.priority,
    discipline,
  );
  const teamInstructions = interpolateOrNull(
    agentTrack?.teamInstructions,
    discipline,
  );
  const skillIndex = buildSkillIndex(focusedSkills, skills);
  const title = hasTrack ? `${specialization} - ${track.name}` : specialization;

  return {
    title,
    identity: identity.trim(),
    priority: trimOrNull(priority),
    skillIndex,
    skillDirnames: skillIndex.map((s) => s.dirname),
    roleContext: trimOrNull(track?.roleContext) ?? "",
    workingStyles: buildWorkingStyleFromBehaviours(
      derivedBehaviours,
      agentBehaviours,
    ),
    disciplineConstraints: agentDiscipline.constraints || [],
    trackConstraints: agentTrack?.constraints || [],
    teamInstructions: trimOrNull(teamInstructions),
  };
}

/**
 * Generate an agent profile for a discipline/track combination.
 * Produces one profile per discipline (x track) with full skill matrix.
 *
 * @param {Object} params - Parameters
 * @returns {Object} Profile with frontmatter, bodyData, and filename
 */
export function generateAgentProfile({
  discipline,
  track,
  level,
  skills,
  capabilities,
  behaviours,
  agentBehaviours,
  agentDiscipline,
  agentTrack,
}) {
  const allSkills = deriveAgentSkills({
    discipline,
    track,
    level,
    skills,
    capabilities,
  });
  const focusedSkills = focusAgentSkills(allSkills);
  const derivedBehaviours = deriveAgentBehaviours({
    discipline,
    track,
    level,
    behaviours,
  });

  const roleTitle = discipline.roleTitle;
  const kebabRole = toKebabCase(roleTitle.toLowerCase().replace(/\s+/g, "-"));
  const hasTrack = track && track.id !== "null";
  const filename = hasTrack
    ? `${kebabRole}--${track.id}.agent.md`
    : `${kebabRole}.agent.md`;
  const profileName = filename.replace(/\.agent\.md$/, "");

  const specialization = discipline.specialization || discipline.name;
  const description = hasTrack
    ? `${specialization} (${track.name}).`
    : `${specialization}.`;

  const bodyData = buildProfileBodyData({
    discipline,
    track,
    hasTrack,
    focusedSkills,
    derivedBehaviours,
    agentBehaviours,
    agentDiscipline,
    agentTrack,
    skills,
  });

  const frontmatter = {
    name: profileName,
    description,
    model: "opus",
    skills: bodyData.skillDirnames,
  };

  return { frontmatter, bodyData, filename };
}

/**
 * Build a list of all available agents in the system
 * @param {Object} params - Parameters
 * @returns {Array<{id: string, name: string, description: string}>} List of all agents
 */
export function buildAgentIndex({
  disciplines,
  tracks,
  agentDisciplines,
  agentTracks,
}) {
  const agents = [];

  const agentDisciplineIds = new Set(agentDisciplines.map((d) => d.id));
  const agentTrackIds = new Set(agentTracks.map((t) => t.id));

  for (const discipline of disciplines) {
    if (!agentDisciplineIds.has(discipline.id)) continue;

    const roleTitle = discipline.roleTitle;
    const kebabRole = toKebabCase(roleTitle.toLowerCase().replace(/\s+/g, "-"));
    const specialization = discipline.specialization || discipline.name;

    const validTracks = tracks.filter(
      (t) => agentTrackIds.has(t.id) && discipline.validTracks?.includes(t.id),
    );

    if (validTracks.length === 0) {
      agents.push({
        id: kebabRole,
        name: specialization,
        description: `${specialization}.`,
      });
    } else {
      for (const track of validTracks) {
        const id = `${kebabRole}--${track.id}`;
        const name = `${specialization} - ${track.name}`;
        const description = `${specialization} (${track.name}).`;
        agents.push({ id, name, description });
      }
    }
  }

  return agents;
}

// Keys mirror products/map/starter/levels.yaml expectations schema. Adding a
// new key to that schema requires a matching entry here AND a matching case
// in libraries/libskill/test/agent-team-instructions.test.js case G, which
// fails loudly on any unknown key that leaks through.
function renderLevelExpectations(level) {
  const e = level?.expectations;
  if (!e || typeof e !== "object") return null;
  const bullets = [];
  if (e.impactScope) bullets.push(`- **Impact scope:** ${e.impactScope}`);
  if (e.autonomyExpectation)
    bullets.push(`- **Autonomy:** ${e.autonomyExpectation}`);
  if (e.influenceScope)
    bullets.push(`- **Influence scope:** ${e.influenceScope}`);
  if (e.complexityHandled)
    bullets.push(`- **Complexity:** ${e.complexityHandled}`);
  if (bullets.length === 0) return null;
  return `## Level Expectations\n\n${bullets.join("\n")}\n`;
}

/**
 * Interpolate teamInstructions from a track's agent section, optionally
 * composing a `## Level Expectations` section drawn from the level's
 * `expectations` block.
 *
 * @param {Object} params
 * @param {Object} params.agentTrack - Agent track definition
 * @param {Object} params.humanDiscipline - Human discipline (with roleTitle, specialization)
 * @param {Object} [params.level] - Optional level entity whose `expectations`
 *   block is composed after the interpolated team-instructions body. When
 *   omitted, the return value is byte-identical to the pre-`level` behaviour.
 * @returns {string|null} Composed team-instructions content, or null when
 *   neither input contributes content.
 */
export function interpolateTeamInstructions({
  agentTrack,
  humanDiscipline,
  level,
}) {
  const ti = agentTrack?.teamInstructions
    ? substituteTemplateVars(agentTrack.teamInstructions, humanDiscipline)
    : null;
  const expectations = level ? renderLevelExpectations(level) : null;
  if (!ti && !expectations) return null;
  if (ti && expectations) return `${ti}\n\n${expectations}`;
  return ti || expectations;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Render an installation-scoped organizational context slot to a markdown
 * section appended to the rendered .claude/CLAUDE.md. The section opens with
 * `## Organizational Context`; downstream tooling matches the LAST occurrence
 * of that heading (it is always appended last). Returns null when no concern
 * is populated — callers treat that as "no section."
 *
 * @param {Object|null|undefined} orgContext - Loaded organizational-context.yaml
 * @returns {string|null}
 */
export function renderOrganizationalContext(orgContext) {
  if (!orgContext || typeof orgContext !== "object") return null;
  const {
    repositories,
    team,
    manager,
    adjacentLeads,
    projects,
    escalationPaths,
  } = orgContext;

  const bullets = [];
  if (nonEmptyArray(repositories)) {
    bullets.push(`- **Repositories:** ${repositories.join(", ")}`);
  }
  if (nonEmptyString(team)) {
    bullets.push(`- **Team:** ${team}`);
  }
  if (nonEmptyString(manager)) {
    bullets.push(`- **Manager:** ${manager}`);
  }
  if (nonEmptyArray(adjacentLeads)) {
    const leads = adjacentLeads
      .map((entry) => `${entry.handle} (${entry.role})`)
      .join(", ");
    bullets.push(`- **Adjacent leads:** ${leads}`);
  }
  if (nonEmptyArray(projects)) {
    bullets.push(`- **Projects:** ${projects.join(", ")}`);
  }
  if (nonEmptyArray(escalationPaths)) {
    const subBullets = escalationPaths
      .map((entry) => `  - ${entry.trigger} → ${entry.destination}`)
      .join("\n");
    bullets.push(`- **Escalation paths:**\n${subBullets}`);
  }

  if (bullets.length === 0) return null;
  return `## Organizational Context\n\n${bullets.join("\n")}\n`;
}

// Re-export from extracted modules for backward compatibility
export {
  validateAgentProfile,
  validateAgentSkill,
} from "./agent-validation.js";
