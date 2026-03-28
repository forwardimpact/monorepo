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
 * identity, creating distinct profiles for each discipline × track combination.
 *
 * Stage-based agents (plan, code, review) use lifecycle stages for tool sets,
 * stage transitions, and constraints. See concept/lifecycle.md for details.
 *
 * NOTE: This module uses prepareAgentProfile() from profile.js for unified
 * skill/behaviour derivation. The deriveAgentSkills() and deriveAgentBehaviours()
 * functions are thin wrappers for backward compatibility.
 */

import { deriveSkillMatrix, deriveBehaviourProfile } from "./derivation.js";

/**
 * Lowercase the first character of a string
 * @param {string} s
 * @returns {string}
 */
const lcFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
import {
  filterAgentSkills,
  sortAgentSkills,
  sortAgentBehaviours,
  focusAgentSkills,
} from "./policies/composed.js";
import { compareByStageOrder } from "./policies/orderings.js";
import { LIMIT_AGENT_WORKING_STYLES } from "./policies/thresholds.js";
import { SkillProficiency } from "@forwardimpact/map/levels";

/**
 * Derive the reference level for agent generation.
 *
 * The reference level determines the skill and behaviour expectations for agents.
 * We select the first level where primary skills reach "practitioner" level,
 * as this represents substantive senior-level expertise suitable for AI agents.
 *
 * Fallback logic:
 * 1. First level with practitioner-level primary skills
 * 2. First level with working-level primary skills (if no practitioner found)
 * 3. Middle level by level (if neither found)
 *
 * @param {Array<Object>} levels - Array of level definitions, each with baseSkillProficiencies.primary
 * @returns {Object} The reference level
 * @throws {Error} If no levels are provided
 */
export function deriveReferenceLevel(levels) {
  if (!levels || levels.length === 0) {
    throw new Error("No levels configured");
  }

  // Sort by level to ensure consistent ordering
  const sorted = [...levels].sort((a, b) => a.ordinalRank - b.ordinalRank);

  // First: find the first level with practitioner-level primary skills
  const practitionerLevel = sorted.find(
    (g) => g.baseSkillProficiencies?.primary === SkillProficiency.PRACTITIONER,
  );
  if (practitionerLevel) {
    return practitionerLevel;
  }

  // Fallback: find the first level with working-level primary skills
  const workingLevel = sorted.find(
    (g) => g.baseSkillProficiencies?.primary === SkillProficiency.WORKING,
  );
  if (workingLevel) {
    return workingLevel;
  }

  // Final fallback: use the middle level
  const middleIndex = Math.floor(sorted.length / 2);
  return sorted[middleIndex];
}

/**
 * Discipline ID to abbreviation mapping for file naming
 * Falls back to first letters of discipline name if not specified
 * @type {Object.<string, string>}
 */
const DISCIPLINE_ABBREVIATIONS = {
  software_engineering: "se",
  data_engineering: "de",
  data_science: "ds",
};

/**
 * Get abbreviation for a discipline ID
 * Falls back to first two letters if no mapping exists
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
 * Returns skills sorted by level (highest first) for the given discipline × track
 * Excludes human-only skills and keeps only skills at the highest derived level.
 * This approach respects track modifiers—a broad skill boosted to the same level
 * as primary skills will be included.
 * @param {Object} params - Parameters
 * @param {Object} params.discipline - Human discipline definition
 * @param {Object} params.track - Human track definition
 * @param {Object} params.level - Reference level for derivation
 * @param {Array} params.skills - All available skills
 * @returns {Array} Skills sorted by derived level (highest first)
 */
export function deriveAgentSkills({ discipline, track, level, skills }) {
  // Use shared derivation
  const skillMatrix = deriveSkillMatrix({
    discipline,
    level,
    track,
    skills,
  });

  // Apply agent-specific filtering and sorting using policies
  const filtered = filterAgentSkills(skillMatrix);
  return sortAgentSkills(filtered);
}

/**
 * Derive agent behaviours using the unified profile system
 * Returns behaviours sorted by maturity (highest first) for the given discipline × track
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
 * @typedef {Object} WorkingStyleEntry
 * @property {string} title - Section title (e.g. "Own the outcome end-to-end")
 * @property {string} content - Working style content (markdown)
 */

/**
 * Build working style entries from emphasized behaviours
 * Returns structured data for template iteration
 * @param {Array} derivedBehaviours - Behaviours sorted by maturity (highest first)
 * @param {Array} agentBehaviours - Agent behaviour definitions with principles
 * @param {number} topN - Number of top behaviours to include
 * @returns {WorkingStyleEntry[]} Array of working style entries
 */
function buildWorkingStyleFromBehaviours(
  derivedBehaviours,
  agentBehaviours,
  topN = LIMIT_AGENT_WORKING_STYLES,
) {
  const entries = [];

  // Get top N behaviours by maturity
  const topBehaviours = derivedBehaviours.slice(0, topN);

  for (const derived of topBehaviours) {
    const agentBehaviour = findAgentBehaviour(
      agentBehaviours,
      derived.behaviourId,
    );
    // Skip if no agent behaviour data or no content to display
    if (!agentBehaviour) continue;
    if (!agentBehaviour.workingStyle && !agentBehaviour.principles) continue;

    // Use title as section header
    const title = agentBehaviour.title || derived.behaviourName;

    // Include workingStyle if available, otherwise fall back to principles
    const content = agentBehaviour.workingStyle
      ? agentBehaviour.workingStyle.trim()
      : agentBehaviour.principles.trim();

    entries.push({ title, content });
  }

  return entries;
}

/**
 * Generate SKILL.md content from skill data
 * @param {Object} skillData - Skill with agent section containing stages
 * @param {Array} stages - All stage entities
 * @returns {Object} Skill with frontmatter, title, stages array, instructions, installScript, implementationReference, toolReferences, dirname
 */
export function generateSkillMarkdown(skillData, stages) {
  const { agent, name } = skillData;

  if (!agent) {
    throw new Error(`Skill ${skillData.id} has no agent section`);
  }

  if (!agent.stages) {
    throw new Error(`Skill ${skillData.id} agent section missing stages`);
  }

  // Build stage lookup map
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  // Transform stages object to array for template rendering
  const stagesArray = Object.entries(agent.stages).map(
    ([stageId, stageData]) => {
      const stageEntity = stageMap.get(stageId);
      const stageName = stageEntity?.name || stageId;

      // Find next stage from handoffs
      let nextStageName = "Complete";
      if (stageEntity?.handoffs) {
        const nextHandoff = stageEntity.handoffs.find(
          (h) => h.targetStage !== stageId,
        );
        if (nextHandoff) {
          const nextStage = stageMap.get(nextHandoff.targetStage);
          nextStageName = nextStage?.name || nextHandoff.targetStage;
        }
      }

      return {
        stageId,
        stageName,
        nextStageName,
        focus: stageData.focus,
        readChecklist: stageData.readChecklist || [],
        confirmChecklist: stageData.confirmChecklist || [],
      };
    },
  );

  // Sort stages using canonical ordering from loaded stage data
  const stageComparator = compareByStageOrder(stages);
  stagesArray.sort(stageComparator);

  return {
    frontmatter: {
      name: agent.name,
      description: agent.description,
      useWhen: agent.useWhen || "",
    },
    title: name,
    stages: stagesArray,
    instructions: skillData.instructions || "",
    installScript: skillData.installScript || "",
    implementationReference: skillData.implementationReference || "",
    toolReferences: skillData.toolReferences || [],
    dirname: agent.name,
  };
}

/**
 * Estimate total character length of bodyData fields
 * @param {Object} bodyData - Structured profile body data
 * @returns {number} Estimated character count
 */
function estimateBodyDataLength(bodyData) {
  let length = 0;

  // String fields
  const stringFields = [
    "title",
    "stageDescription",
    "identity",
    "priority",
    "roleContext",
    "workingStyle",
  ];
  for (const field of stringFields) {
    if (bodyData[field]) {
      length += bodyData[field].length;
    }
  }

  // Array fields
  if (bodyData.skillIndex) {
    for (const skill of bodyData.skillIndex) {
      length +=
        skill.name.length + skill.dirname.length + skill.useWhen.length + 50;
    }
  }
  if (bodyData.stageConstraints) {
    for (const c of bodyData.stageConstraints) {
      length += c.length + 2;
    }
  }
  if (bodyData.disciplineConstraints) {
    for (const c of bodyData.disciplineConstraints) {
      length += c.length + 2;
    }
  }
  if (bodyData.trackConstraints) {
    for (const c of bodyData.trackConstraints) {
      length += c.length + 2;
    }
  }

  return length;
}

/**
 * Validate agent profile against Claude Code spec constraints
 * @param {Object} profile - Generated profile
 * @returns {Array<string>} Array of error messages (empty if valid)
 */
export function validateAgentProfile(profile) {
  const errors = [];

  // Required: name
  if (!profile.frontmatter.name) {
    errors.push("Missing required field: name");
  }

  // Required: description
  if (!profile.frontmatter.description) {
    errors.push("Missing required field: description");
  }

  // Name format (if provided)
  if (profile.frontmatter.name) {
    if (!/^[a-zA-Z0-9._-]+$/.test(profile.frontmatter.name)) {
      errors.push("Name contains invalid characters");
    }
  }

  // Model field
  if (
    profile.frontmatter.model &&
    !["sonnet", "opus", "haiku", "inherit"].includes(profile.frontmatter.model)
  ) {
    errors.push("Model must be one of: sonnet, opus, haiku, inherit");
  }

  // Skills format
  if (
    profile.frontmatter.skills &&
    !Array.isArray(profile.frontmatter.skills)
  ) {
    errors.push("Skills must be an array");
  }

  // Body length estimate
  const bodyLength = estimateBodyDataLength(profile.bodyData);
  if (bodyLength > 30000) {
    errors.push(`Body exceeds 30,000 character limit (${bodyLength})`);
  }

  return errors;
}

/**
 * Validate agent skill against spec constraints
 * @param {Object} skill - Generated skill
 * @returns {Array<string>} Array of error messages (empty if valid)
 */
export function validateAgentSkill(skill) {
  const errors = [];

  // Required: name
  if (!skill.frontmatter.name) {
    errors.push("Missing required field: name");
  } else {
    const name = skill.frontmatter.name;

    // Name format: lowercase, hyphens, 1-64 chars
    if (!/^[a-z0-9-]+$/.test(name)) {
      errors.push("Name must be lowercase alphanumeric with hyphens");
    }
    if (name.length > 64) {
      errors.push("Name exceeds 64 character limit");
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      errors.push("Name cannot start or end with hyphen");
    }
    if (name.includes("--")) {
      errors.push("Name cannot contain consecutive hyphens");
    }
  }

  // Required: description
  if (!skill.frontmatter.description) {
    errors.push("Missing required field: description");
  } else if (skill.frontmatter.description.length > 1024) {
    errors.push("Description exceeds 1024 character limit");
  }

  return errors;
}

// =============================================================================
// Stage-Based Agent Generation
// =============================================================================

/**
 * Derive stage transition data for a stage-based agent.
 * Generates structured transition descriptions from stage.handoffs with
 * summary instructions and target stage entry criteria. Used to render
 * the "Stage transitions" body section in the agent profile.
 * @param {Object} params - Parameters
 * @param {Object} params.stage - Stage definition
 * @param {Array} params.stages - All stages (to look up target stage entry criteria)
 * @returns {Array<{targetStageName: string, summaryInstruction: string, entryCriteria: string[]}>} Transition definitions
 */
export function deriveStageTransitions({ stage, stages }) {
  if (!stage.handoffs || stage.handoffs.length === 0) {
    return [];
  }

  return stage.handoffs
    .filter((handoff) => handoff.targetStage !== stage.id)
    .map((handoff) => {
      // Find the target stage to get its confirmChecklist
      const targetStage = stages.find((s) => s.id === handoff.targetStage);
      const confirmChecklist = targetStage?.confirmChecklist || [];
      const targetStageName =
        targetStage?.name.charAt(0).toUpperCase() +
          targetStage?.name.slice(1) || handoff.targetStage;

      // Build summary instruction
      const summaryInstruction = `${handoff.prompt} Summarize what was completed in the ${stage.name} stage.`;

      return {
        targetStageName,
        summaryInstruction,
        entryCriteria: confirmChecklist,
      };
    });
}

/**
 * Build the profile body data for a stage-based agent
 * Returns structured data for template rendering
 * @param {Object} params - Parameters
 * @param {Object} params.stage - Stage definition
 * @param {Object} params.humanDiscipline - Human discipline definition
 * @param {Object} params.humanTrack - Human track definition
 * @param {Object} params.agentDiscipline - Agent discipline definition
 * @param {Object} params.agentTrack - Agent track definition
 * @param {Array} params.derivedSkills - Skills sorted by level
 * @param {Array} params.derivedBehaviours - Behaviours sorted by maturity
 * @param {Array} params.agentBehaviours - Agent behaviour definitions
 * @param {Array} params.skills - All skill definitions (for agent section lookup)
 * @param {Array} params.stages - All stages (for stage transition derivation)
 * @returns {Object} Structured profile body data
 */
function buildStageProfileBodyData({
  stage,
  humanDiscipline,
  humanTrack,
  agentDiscipline,
  agentTrack,
  derivedSkills,
  derivedBehaviours,
  agentBehaviours,
  skills,
  stages,
}) {
  const name = `${humanDiscipline.specialization || humanDiscipline.name} - ${humanTrack.name}`;
  const stageName = stage.name.charAt(0).toUpperCase() + stage.name.slice(1);

  // Build identity - prefer track, fall back to discipline
  const rawIdentity = agentTrack.identity || agentDiscipline.identity;
  const identity = substituteTemplateVars(rawIdentity, humanDiscipline);

  // Build priority - prefer track, fall back to discipline (optional)
  const rawPriority = agentTrack.priority || agentDiscipline.priority;
  const priority = rawPriority
    ? substituteTemplateVars(rawPriority, humanDiscipline)
    : null;

  // Build skill index from derived skills (already focused by deriveStageAgent)
  // Filter to only include skills that have stage-specific guidance for this stage
  const skillIndex = derivedSkills
    .map((derived) => {
      const skill = skills.find((s) => s.id === derived.skillId);
      if (!skill?.agent) return null;
      if (!skill.agent.stages?.[stage.id]) return null;
      return {
        name: derived.skillName,
        dirname: skill.agent.name,
        useWhen: lcFirst(skill.agent.useWhen?.trim() || ""),
      };
    })
    .filter(Boolean);

  // Role Context - use track's roleContext (shared with human job descriptions)
  const roleContext = humanTrack.roleContext.trim();

  // Working styles from derived behaviours (structured for template iteration)
  const workingStyles = buildWorkingStyleFromBehaviours(
    derivedBehaviours,
    agentBehaviours,
  );

  // Constraints — separated by source for layered rendering
  const stageConstraints = stage.constraints || [];
  const disciplineConstraints = agentDiscipline.constraints || [];
  const trackConstraints = agentTrack.constraints || [];

  // Stage transitions for body section
  const stageTransitions = deriveStageTransitions({ stage, stages });

  // Return format from stage data
  const returnFormat = stage.returnFormat || [];

  // Skill dirnames for frontmatter skills: array
  const skillDirnames = skillIndex.map((s) => s.dirname);

  if (skillIndex.length < 2) {
    console.warn(
      `Warning: ${stage.id} stage for ${humanDiscipline.id}/${humanTrack.id} has fewer than 2 skills (${skillIndex.length})`,
    );
  }

  return {
    title: `${name} - ${stageName} Agent`,
    stageDescription: stage.description,
    stageId: stage.id,
    stageName,
    identity: identity.trim(),
    priority: priority ? priority.trim() : null,
    skillIndex,
    skillDirnames,
    roleContext,
    workingStyles,
    stageConstraints,
    disciplineConstraints,
    trackConstraints,
    returnFormat,
    stageTransitions,
  };
}

/**
 * Derive a stage-specific agent profile
 * Combines discipline, track, and stage to produce a complete agent definition
 * @param {Object} params - Parameters
 * @param {Object} params.discipline - Human discipline definition
 * @param {Object} params.track - Human track definition
 * @param {Object} params.stage - Stage definition from stages.yaml
 * @param {Object} params.level - Reference level for skill derivation
 * @param {Array} params.skills - All available skills
 * @param {Array} params.behaviours - All available behaviours
 * @param {Array} params.agentBehaviours - Agent behaviour definitions
 * @param {Object} params.agentDiscipline - Agent discipline definition
 * @param {Object} params.agentTrack - Agent track definition
 * @returns {Object} Agent definition with skills, behaviours, constraints
 */
export function deriveStageAgent({
  discipline,
  track,
  stage,
  level,
  skills,
  behaviours,
  agentBehaviours,
  agentDiscipline,
  agentTrack,
}) {
  // Derive skills and behaviours
  const allSkills = deriveAgentSkills({
    discipline,
    track,
    level,
    skills,
  });

  // Focus skills for profile body (limited set to reduce context bloat)
  const focusedSkills = focusAgentSkills(allSkills);

  const derivedBehaviours = deriveAgentBehaviours({
    discipline,
    track,
    level,
    behaviours,
  });

  return {
    stage,
    discipline,
    track,
    derivedSkills: focusedSkills,
    derivedBehaviours,
    constraints: [
      ...(stage.constraints || []),
      ...(agentDiscipline.constraints || []),
      ...(agentTrack.constraints || []),
    ],
    agentDiscipline,
    agentTrack,
    agentBehaviours,
  };
}

/**
 * Generate a stage-specific agent profile (.md) for Claude Code
 * Produces the complete profile with frontmatter, bodyData, and filename
 * @param {Object} params - Parameters
 * @param {Object} params.discipline - Human discipline definition
 * @param {Object} params.track - Human track definition
 * @param {Object} params.stage - Stage definition
 * @param {Object} params.level - Reference level
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @param {Array} params.agentBehaviours - Agent behaviour definitions
 * @param {Object} params.agentDiscipline - Agent discipline definition
 * @param {Object} params.agentTrack - Agent track definition
 * @param {Array} params.stages - All stages (for stage transition derivation)
 * @returns {Object} Profile with frontmatter, bodyData, and filename
 */
export function generateStageAgentProfile({
  discipline,
  track,
  stage,
  level,
  skills,
  behaviours,
  agentBehaviours,
  agentDiscipline,
  agentTrack,
  stages,
}) {
  // Derive the complete agent
  const agent = deriveStageAgent({
    discipline,
    track,
    stage,
    level,
    skills,
    behaviours,
    agentBehaviours,
    agentDiscipline,
    agentTrack,
  });

  // Build names
  const abbrev = getDisciplineAbbreviation(discipline.id);
  const fullName = `${abbrev}-${toKebabCase(track.id)}-${stage.id}`;
  const filename = `${fullName}.md`;

  // Build description using shared helper
  const description = buildAgentDescription(discipline, track, stage);

  // Build structured profile body data
  const bodyData = buildStageProfileBodyData({
    stage,
    humanDiscipline: discipline,
    humanTrack: track,
    agentDiscipline,
    agentTrack,
    derivedSkills: agent.derivedSkills,
    derivedBehaviours: agent.derivedBehaviours,
    agentBehaviours,
    skills,
    stages,
  });

  // Build frontmatter (Claude Code agent spec)
  const frontmatter = {
    name: fullName,
    description,
    model: "sonnet",
    skills: bodyData.skillDirnames,
  };

  return {
    frontmatter,
    bodyData,
    filename,
  };
}

/**
 * Build an agent description from discipline, track, and stage
 * Uses stage.summary for third-person metadata description
 * @param {Object} discipline - Human discipline definition
 * @param {Object} track - Human track definition
 * @param {Object} stage - Stage definition with summary field
 * @returns {string} Agent description
 */
function buildAgentDescription(discipline, track, stage) {
  const stageSummary = stage.summary || stage.name;
  return `${stageSummary} for ${discipline.specialization || discipline.name} (${track.name}).`;
}

/**
 * Build a list of all available agents in the system
 * Enumerates all valid discipline × track × stage combinations
 * Returns id, name, and description for each agent
 * @param {Object} params - Parameters
 * @param {Array} params.disciplines - Human discipline definitions
 * @param {Array} params.tracks - Human track definitions
 * @param {Array} params.stages - Stage definitions
 * @param {Array} params.agentDisciplines - Agent discipline definitions (to filter valid combinations)
 * @param {Array} params.agentTracks - Agent track definitions (to filter valid combinations)
 * @returns {Array<{id: string, name: string, description: string}>} List of all agents
 */
export function buildAgentIndex({
  disciplines,
  tracks,
  stages,
  agentDisciplines,
  agentTracks,
}) {
  const agents = [];

  // Build lookup sets for valid agent combinations
  const agentDisciplineIds = new Set(agentDisciplines.map((d) => d.id));
  const agentTrackIds = new Set(agentTracks.map((t) => t.id));

  for (const discipline of disciplines) {
    // Skip disciplines without agent definitions
    if (!agentDisciplineIds.has(discipline.id)) continue;

    for (const track of tracks) {
      // Skip tracks without agent definitions
      if (!agentTrackIds.has(track.id)) continue;

      // Build base name (matches filename pattern)
      const abbrev = getDisciplineAbbreviation(discipline.id);
      const baseName = `${abbrev}-${toKebabCase(track.id)}`;

      for (const stage of stages) {
        const id = `${baseName}-${stage.id}`;
        const fullName = `${discipline.specialization || discipline.name} - ${track.name} - ${stage.name.charAt(0).toUpperCase() + stage.name.slice(1)} Agent`;
        const description = buildAgentDescription(discipline, track, stage);

        agents.push({
          id,
          name: fullName,
          description,
        });
      }
    }
  }

  return agents;
}
