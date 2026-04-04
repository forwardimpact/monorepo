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
 *
 * Stage-based agents (plan, code, review) use lifecycle stages for tool sets,
 * stage transitions, and constraints. See concept/lifecycle.md for details.
 *
 * NOTE: This module uses prepareAgentProfile() from profile.js for unified
 * skill/behaviour derivation. The deriveAgentSkills() and deriveAgentBehaviours()
 * functions are thin wrappers for backward compatibility.
 */

import { deriveSkillMatrix, deriveBehaviourProfile } from "./derivation.js";

import {
  filterAgentSkills,
  sortAgentSkills,
  sortAgentBehaviours,
} from "./policies/composed.js";
import { compareByStageOrder } from "./policies/orderings.js";
import { SkillProficiency } from "@forwardimpact/map/levels";

/**
 * Derive the reference level for agent generation.
 *
 * The reference level determines the skill and behaviour expectations for agents.
 * We select the first level where primary skills reach "practitioner" level,
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
    (g) => g.baseSkillProficiencies?.primary === SkillProficiency.PRACTITIONER,
  );
  if (practitionerLevel) return practitionerLevel;

  const workingLevel = sorted.find(
    (g) => g.baseSkillProficiencies?.primary === SkillProficiency.WORKING,
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
  software_engineering: "se",
  data_engineering: "de",
  data_science: "ds",
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
export function deriveAgentSkills({ discipline, track, level, skills }) {
  const skillMatrix = deriveSkillMatrix({ discipline, level, track, skills });
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
 * Generate SKILL.md content from skill data
 * @param {Object} skillData - Skill with agent section containing stages
 * @param {Array} stages - All stage entities
 * @returns {Object} Skill with frontmatter, title, stages array, etc.
 */
export function generateSkillMarkdown(skillData, stages) {
  const { agent, name } = skillData;

  if (!agent) {
    throw new Error(`Skill ${skillData.id} has no agent section`);
  }
  if (!agent.stages) {
    throw new Error(`Skill ${skillData.id} agent section missing stages`);
  }

  const stageMap = new Map(stages.map((s) => [s.id, s]));

  const stagesArray = Object.entries(agent.stages).map(
    ([stageId, stageData]) => {
      const stageEntity = stageMap.get(stageId);
      const stageName = stageEntity?.name || stageId;

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
 * Derive stage transition data for a stage-based agent.
 * @param {Object} params - Parameters
 * @param {Object} params.stage - Stage definition
 * @param {Array} params.stages - All stages
 * @returns {Array<{targetStageName: string, summaryInstruction: string, entryCriteria: string[]}>}
 */
export function deriveStageTransitions({ stage, stages }) {
  if (!stage.handoffs || stage.handoffs.length === 0) {
    return [];
  }

  return stage.handoffs
    .filter((handoff) => handoff.targetStage !== stage.id)
    .map((handoff) => {
      const targetStage = stages.find((s) => s.id === handoff.targetStage);
      const confirmChecklist = targetStage?.confirmChecklist || [];
      const targetStageName =
        targetStage?.name.charAt(0).toUpperCase() +
          targetStage?.name.slice(1) || handoff.targetStage;

      const summaryInstruction = `${handoff.prompt} Summarize what was completed in the ${stage.name} stage.`;

      return {
        targetStageName,
        summaryInstruction,
        entryCriteria: confirmChecklist,
      };
    });
}

// Re-export from extracted modules for backward compatibility
export {
  validateAgentProfile,
  validateAgentSkill,
} from "./agent-validation.js";

export {
  deriveStageAgent,
  generateStageAgentProfile,
  buildAgentIndex,
  interpolateTeamInstructions,
} from "./agent-stage.js";
