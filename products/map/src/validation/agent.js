import {
  createValidationResult,
  createError,
  createWarning,
} from "./common.js";

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

function validateSkillAgentStages(skillsWithAgent, requiredStages) {
  const errors = [];
  const warnings = [];

  for (const skill of skillsWithAgent) {
    const stages = skill.agent.stages || {};
    const missingStages = requiredStages.filter((stage) => !stages[stage]);

    if (missingStages.length > 0) {
      warnings.push(
        createWarning(
          "INCOMPLETE_STAGES",
          `Skill '${skill.id}' agent section missing stages: ${missingStages.join(", ")}`,
          `skills.${skill.id}.agent.stages`,
        ),
      );
    }

    for (const [stageId, stageData] of Object.entries(stages)) {
      errors.push(
        ...validateAgentSkillStageFields(skill.id, stageId, stageData),
      );
    }
  }

  return { errors, warnings };
}

function validateAgentSkillStageFields(skillId, stageId, stageData) {
  const errors = [];
  const basePath = `skills.${skillId}.agent.stages.${stageId}`;

  if (!stageData.focus) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        `Skill '${skillId}' agent stage '${stageId}' missing focus`,
        `${basePath}.focus`,
      ),
    );
  }
  if (
    !stageData.readChecklist ||
    !Array.isArray(stageData.readChecklist) ||
    stageData.readChecklist.length === 0
  ) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        `Skill '${skillId}' agent stage '${stageId}' missing or empty readChecklist`,
        `${basePath}.readChecklist`,
      ),
    );
  }
  if (
    !stageData.confirmChecklist ||
    !Array.isArray(stageData.confirmChecklist) ||
    stageData.confirmChecklist.length === 0
  ) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        `Skill '${skillId}' agent stage '${stageId}' missing or empty confirmChecklist`,
        `${basePath}.confirmChecklist`,
      ),
    );
  }

  return errors;
}

function validateStageHandoffs(humanStages, stageIds) {
  const errors = [];

  for (const stage of humanStages) {
    if (!stage.handoffs) continue;
    for (const handoff of stage.handoffs) {
      const targetId = handoff.targetStage || handoff.target;
      if (targetId && !stageIds.has(targetId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Stage '${stage.id}' handoff references unknown stage '${targetId}'`,
            `stages.${stage.id}.handoffs`,
            targetId,
          ),
        );
      }
    }
  }

  return errors;
}

function buildCoverageWarnings(skillsWithAgent, requiredStages) {
  const warnings = [];

  const completCount = skillsWithAgent.filter((s) => {
    const stages = s.agent.stages || {};
    return requiredStages.every((stage) => stages[stage]);
  }).length;

  if (completCount < skillsWithAgent.length) {
    warnings.push(
      createWarning(
        "INCOMPLETE_COVERAGE",
        `${completCount}/${skillsWithAgent.length} skills have complete stage coverage (plan, code, review)`,
        "agentData",
      ),
    );
  }

  return warnings;
}

/**
 * @param {Object} params
 * @param {Object} params.humanData
 * @param {Object} params.agentData
 * @returns {import('../levels.js').ValidationResult}
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
  const stageIds = new Set((humanData.stages || []).map((s) => s.id));

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
  const requiredStages = (humanData.stages || []).map((s) => s.id);

  const stageResult = validateSkillAgentStages(skillsWithAgent, requiredStages);
  errors.push(...stageResult.errors);
  warnings.push(...stageResult.warnings);

  errors.push(...validateStageHandoffs(humanData.stages || [], stageIds));

  warnings.push(...buildCoverageWarnings(skillsWithAgent, requiredStages));

  return createValidationResult(errors.length === 0, errors, warnings);
}
