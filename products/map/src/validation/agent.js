import { createValidationResult, createError } from "./common.js";

function validateAgentDisciplines(agentDisciplines, humanDisciplineIds) {
  const errors = [];

  for (const agentDiscipline of agentDisciplines) {
    if (!humanDisciplineIds.has(agentDiscipline.id)) {
      errors.push(
        createError(
          "ORPHANED_AGENT",
          `Agent discipline '${agentDiscipline.id}' has no human definition`,
          `agentData.disciplines`,
          agentDiscipline.id,
        ),
      );
    }

    if (!agentDiscipline.identity) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          `Agent discipline '${agentDiscipline.id}' missing identity`,
          `agentData.disciplines.${agentDiscipline.id}.identity`,
        ),
      );
    }
  }

  return errors;
}

function validateAgentTracks(agentTracks, humanTrackIds) {
  const errors = [];

  for (const agentTrack of agentTracks) {
    if (!humanTrackIds.has(agentTrack.id)) {
      errors.push(
        createError(
          "ORPHANED_AGENT",
          `Agent track '${agentTrack.id}' has no human definition`,
          `agentData.tracks`,
          agentTrack.id,
        ),
      );
    }
  }

  return errors;
}

function validateAgentBehaviours(agentBehaviours, humanBehaviourIds) {
  const errors = [];

  for (const agentBehaviour of agentBehaviours) {
    if (!humanBehaviourIds.has(agentBehaviour.id)) {
      errors.push(
        createError(
          "ORPHANED_AGENT",
          `Agent behaviour '${agentBehaviour.id}' has no human definition`,
          `agentData.behaviours`,
          agentBehaviour.id,
        ),
      );
    }

    if (!agentBehaviour.title) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          `Agent behaviour '${agentBehaviour.id}' missing title`,
          `agentData.behaviours.${agentBehaviour.id}.title`,
        ),
      );
    }
    if (!agentBehaviour.workingStyle) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          `Agent behaviour '${agentBehaviour.id}' missing workingStyle`,
          `agentData.behaviours.${agentBehaviour.id}.workingStyle`,
        ),
      );
    }
  }

  return errors;
}

function validateSkillAgentFields(skillsWithAgent) {
  const errors = [];
  const warnings = [];

  for (const skill of skillsWithAgent) {
    const basePath = `skills.${skill.id}.agent`;

    if (skill.agent.stages) {
      errors.push(
        createError(
          "INVALID_FIELD",
          `Skill '${skill.id}' agent uses deprecated stages nesting — flatten to agent.focus/readChecklist/confirmChecklist`,
          `${basePath}.stages`,
        ),
      );
    }

    if (!skill.agent.focus) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          `Skill '${skill.id}' agent missing focus`,
          `${basePath}.focus`,
        ),
      );
    }

    if (
      !skill.agent.readChecklist ||
      !Array.isArray(skill.agent.readChecklist) ||
      skill.agent.readChecklist.length === 0
    ) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          `Skill '${skill.id}' agent missing or empty readChecklist`,
          `${basePath}.readChecklist`,
        ),
      );
    }

    if (
      !skill.agent.confirmChecklist ||
      !Array.isArray(skill.agent.confirmChecklist) ||
      skill.agent.confirmChecklist.length === 0
    ) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          `Skill '${skill.id}' agent missing or empty confirmChecklist`,
          `${basePath}.confirmChecklist`,
        ),
      );
    }
  }

  return { errors, warnings };
}

/**
 * @param {Object} params
 * @param {Object} params.humanData
 * @param {Object} params.agentData
 * @returns {import('@forwardimpact/libskill/levels').ValidationResult}
 */
export function validateAgentData({ humanData, agentData }) {
  const errors = [];
  const warnings = [];

  const humanDisciplineIds = new Set(
    (humanData.disciplines || []).map((d) => d.id),
  );
  const humanTrackIds = new Set((humanData.tracks || []).map((t) => t.id));
  const humanBehaviourIds = new Set(
    (humanData.behaviours || []).map((b) => b.id),
  );

  errors.push(
    ...validateAgentDisciplines(
      agentData.disciplines || [],
      humanDisciplineIds,
    ),
  );
  errors.push(...validateAgentTracks(agentData.tracks || [], humanTrackIds));
  errors.push(
    ...validateAgentBehaviours(agentData.behaviours || [], humanBehaviourIds),
  );

  const skillsWithAgent = (humanData.skills || []).filter((s) => s.agent);

  const fieldResult = validateSkillAgentFields(skillsWithAgent);
  errors.push(...fieldResult.errors);
  warnings.push(...fieldResult.warnings);

  return createValidationResult(errors.length === 0, errors, warnings);
}
