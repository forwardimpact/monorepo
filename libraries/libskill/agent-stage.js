/**
 * Stage-Based Agent Generation
 *
 * Pure functions for generating stage-specific agent profiles.
 * Extracted from agent.js to satisfy max-lines rule.
 */

import { deriveSkillMatrix, deriveBehaviourProfile } from "./derivation.js";
import {
  filterAgentSkills,
  sortAgentSkills,
  sortAgentBehaviours,
  focusAgentSkills,
} from "./policies/composed.js";
import { LIMIT_AGENT_WORKING_STYLES } from "./policies/thresholds.js";
import { getDisciplineAbbreviation, toKebabCase } from "./agent.js";

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
 * Derive agent skills using the unified profile system
 * @param {Object} params
 * @param {Object} params.discipline - Human discipline definition
 * @param {Object} params.track - Human track definition
 * @param {Object} params.level - Reference level for derivation
 * @param {Array} params.skills - All available skills
 * @returns {Array} Skills sorted by derived level (highest first)
 */
function deriveAgentSkills({ discipline, track, level, skills }) {
  const skillMatrix = deriveSkillMatrix({ discipline, level, track, skills });
  const filtered = filterAgentSkills(skillMatrix);
  return sortAgentSkills(filtered);
}

/**
 * Derive agent behaviours using the unified profile system
 * @param {Object} params
 * @param {Object} params.discipline - Human discipline definition
 * @param {Object} params.track - Human track definition
 * @param {Object} params.level - Reference level for derivation
 * @param {Array} params.behaviours - All available behaviours
 * @returns {Array} Behaviours sorted by derived maturity (highest first)
 */
function deriveAgentBehaviours({ discipline, track, level, behaviours }) {
  const profile = deriveBehaviourProfile({
    discipline,
    level,
    track,
    behaviours,
  });
  return sortAgentBehaviours(profile);
}

/**
 * Derive stage transition data for a stage-based agent
 * @param {Object} params
 * @param {Object} params.stage - Stage definition
 * @param {Array} params.stages - All stages
 * @returns {Array} Transition definitions
 */
export function deriveStageTransitions({ stage, stages }) {
  if (!stage.handoffs || stage.handoffs.length === 0) return [];

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

/**
 * Build the profile body data for a stage-based agent
 * @param {Object} params - Parameters
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

  const rawIdentity = agentTrack.identity || agentDiscipline.identity;
  const identity = substituteTemplateVars(rawIdentity, humanDiscipline);

  const rawPriority = agentTrack.priority || agentDiscipline.priority;
  const priority = rawPriority
    ? substituteTemplateVars(rawPriority, humanDiscipline)
    : null;

  const rawTeamInstructions = agentTrack.teamInstructions;
  const teamInstructions = rawTeamInstructions
    ? substituteTemplateVars(rawTeamInstructions, humanDiscipline)
    : null;

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

  const roleContext = humanTrack.roleContext.trim();
  const workingStyles = buildWorkingStyleFromBehaviours(
    derivedBehaviours,
    agentBehaviours,
  );

  const stageConstraints = stage.constraints || [];
  const disciplineConstraints = agentDiscipline.constraints || [];
  const trackConstraints = agentTrack.constraints || [];
  const stageTransitions = deriveStageTransitions({ stage, stages });
  const returnFormat = stage.returnFormat || [];
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
    teamInstructions: teamInstructions ? teamInstructions.trim() : null,
  };
}

/**
 * Derive a stage-specific agent profile
 * @param {Object} params - Parameters
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
  const allSkills = deriveAgentSkills({ discipline, track, level, skills });
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
 * Build an agent description from discipline, track, and stage
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
 * Generate a stage-specific agent profile (.md) for Claude Code
 * @param {Object} params - Parameters
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

  const abbrev = getDisciplineAbbreviation(discipline.id);
  const fullName = `${abbrev}-${toKebabCase(track.id)}-${stage.id}`;
  const filename = `${fullName}.md`;
  const description = buildAgentDescription(discipline, track, stage);

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

  const frontmatter = {
    name: fullName,
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
  stages,
  agentDisciplines,
  agentTracks,
}) {
  const agents = [];

  const agentDisciplineIds = new Set(agentDisciplines.map((d) => d.id));
  const agentTrackIds = new Set(agentTracks.map((t) => t.id));

  for (const discipline of disciplines) {
    if (!agentDisciplineIds.has(discipline.id)) continue;

    for (const track of tracks) {
      if (!agentTrackIds.has(track.id)) continue;

      const abbrev = getDisciplineAbbreviation(discipline.id);
      const baseName = `${abbrev}-${toKebabCase(track.id)}`;

      for (const stage of stages) {
        const id = `${baseName}-${stage.id}`;
        const fullName = `${discipline.specialization || discipline.name} - ${track.name} - ${stage.name.charAt(0).toUpperCase() + stage.name.slice(1)} Agent`;
        const description = buildAgentDescription(discipline, track, stage);
        agents.push({ id, name: fullName, description });
      }
    }
  }

  return agents;
}

/**
 * Interpolate teamInstructions from a track's agent section
 * @param {Object} agentTrack - Agent track definition
 * @param {Object} humanDiscipline - Human discipline (with roleTitle, specialization)
 * @returns {string|null} Interpolated team instructions or null
 */
export function interpolateTeamInstructions(agentTrack, humanDiscipline) {
  if (!agentTrack?.teamInstructions) return null;
  return substituteTemplateVars(agentTrack.teamInstructions, humanDiscipline);
}
