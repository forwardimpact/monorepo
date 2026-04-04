import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
} from "../levels.js";

import {
  createValidationResult,
  createError,
  createWarning,
} from "./common.js";

/**
 * @param {import('../levels.js').SelfAssessment} selfAssessment
 * @param {import('../levels.js').Skill[]} skills
 * @param {import('../levels.js').Behaviour[]} behaviours
 * @returns {import('../levels.js').ValidationResult}
 */
export function validateSelfAssessment(selfAssessment, skills, behaviours) {
  const errors = [];
  const warnings = [];
  const skillIds = new Set(skills.map((s) => s.id));
  const behaviourIds = new Set(behaviours.map((b) => b.id));

  if (!selfAssessment) {
    return createValidationResult(false, [
      createError("MISSING_REQUIRED", "Self-assessment is required"),
    ]);
  }

  if (
    !selfAssessment.skillProficiencies ||
    Object.keys(selfAssessment.skillProficiencies).length === 0
  ) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Self-assessment has no skill assessments",
      ),
    );
  } else {
    Object.entries(selfAssessment.skillProficiencies).forEach(
      ([skillId, level]) => {
        if (!skillIds.has(skillId)) {
          errors.push(
            createError(
              "INVALID_REFERENCE",
              `Self-assessment references non-existent skill: ${skillId}`,
              `selfAssessment.skillProficiencies.${skillId}`,
              skillId,
            ),
          );
        }
        if (getSkillProficiencyIndex(level) === -1) {
          errors.push(
            createError(
              "INVALID_VALUE",
              `Self-assessment has invalid skill proficiency for ${skillId}: ${level}`,
              `selfAssessment.skillProficiencies.${skillId}`,
              level,
            ),
          );
        }
      },
    );
  }

  if (
    !selfAssessment.behaviourMaturities ||
    Object.keys(selfAssessment.behaviourMaturities).length === 0
  ) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Self-assessment has no behaviour assessments",
      ),
    );
  } else {
    Object.entries(selfAssessment.behaviourMaturities).forEach(
      ([behaviourId, maturity]) => {
        if (!behaviourIds.has(behaviourId)) {
          errors.push(
            createError(
              "INVALID_REFERENCE",
              `Self-assessment references non-existent behaviour: ${behaviourId}`,
              `selfAssessment.behaviourMaturities.${behaviourId}`,
              behaviourId,
            ),
          );
        }
        if (getBehaviourMaturityIndex(maturity) === -1) {
          errors.push(
            createError(
              "INVALID_VALUE",
              `Self-assessment has invalid behaviour maturity for ${behaviourId}: ${maturity}`,
              `selfAssessment.behaviourMaturities.${behaviourId}`,
              maturity,
            ),
          );
        }
      },
    );
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * @param {import('../levels.js').QuestionBank} questionBank
 * @param {import('../levels.js').Skill[]} skills
 * @param {import('../levels.js').Behaviour[]} behaviours
 * @returns {import('../levels.js').ValidationResult}
 */
export function validateQuestionBank(questionBank, skills, behaviours) {
  const errors = [];
  const warnings = [];
  const skillIds = new Set(skills.map((s) => s.id));
  const behaviourIds = new Set(behaviours.map((b) => b.id));
  const validRoleTypes = ["professionalQuestions", "managementQuestions"];

  if (!questionBank) {
    return createValidationResult(false, [
      createError("MISSING_REQUIRED", "Question bank is required"),
    ]);
  }

  if (questionBank.skillProficiencies) {
    errors.push(
      ...validateSkillQuestions(
        questionBank.skillProficiencies,
        skillIds,
        validRoleTypes,
        warnings,
      ),
    );
  }

  if (questionBank.behaviourMaturities) {
    errors.push(
      ...validateBehaviourQuestions(
        questionBank.behaviourMaturities,
        behaviourIds,
        validRoleTypes,
        warnings,
      ),
    );
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

function validateSkillQuestions(
  skillProficiencies,
  skillIds,
  validRoleTypes,
  warnings,
) {
  const errors = [];

  Object.entries(skillProficiencies).forEach(([skillId, roleTypeQuestions]) => {
    if (!skillIds.has(skillId)) {
      errors.push(
        createError(
          "INVALID_REFERENCE",
          `Question bank references non-existent skill: ${skillId}`,
          `questionBank.skillProficiencies.${skillId}`,
          skillId,
        ),
      );
    }
    Object.entries(roleTypeQuestions || {}).forEach(
      ([roleType, levelQuestions]) => {
        if (!validRoleTypes.includes(roleType)) {
          errors.push(
            createError(
              "INVALID_VALUE",
              `Question bank has invalid role type: ${roleType}`,
              `questionBank.skillProficiencies.${skillId}.${roleType}`,
              roleType,
            ),
          );
          return;
        }
        Object.entries(levelQuestions || {}).forEach(([level, questions]) => {
          if (getSkillProficiencyIndex(level) === -1) {
            errors.push(
              createError(
                "INVALID_VALUE",
                `Question bank has invalid skill proficiency: ${level}`,
                `questionBank.skillProficiencies.${skillId}.${roleType}.${level}`,
                level,
              ),
            );
          }
          if (!Array.isArray(questions) || questions.length === 0) {
            warnings.push(
              createWarning(
                "EMPTY_QUESTIONS",
                `No questions for skill ${skillId} (${roleType}) at level ${level}`,
                `questionBank.skillProficiencies.${skillId}.${roleType}.${level}`,
              ),
            );
          }
        });
      },
    );
  });

  return errors;
}

function validateBehaviourQuestions(
  behaviourMaturities,
  behaviourIds,
  validRoleTypes,
  warnings,
) {
  const errors = [];

  Object.entries(behaviourMaturities).forEach(
    ([behaviourId, roleTypeQuestions]) => {
      if (!behaviourIds.has(behaviourId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Question bank references non-existent behaviour: ${behaviourId}`,
            `questionBank.behaviourMaturities.${behaviourId}`,
            behaviourId,
          ),
        );
      }
      Object.entries(roleTypeQuestions || {}).forEach(
        ([roleType, maturityQuestions]) => {
          if (!validRoleTypes.includes(roleType)) {
            errors.push(
              createError(
                "INVALID_VALUE",
                `Question bank has invalid role type: ${roleType}`,
                `questionBank.behaviourMaturities.${behaviourId}.${roleType}`,
                roleType,
              ),
            );
            return;
          }
          Object.entries(maturityQuestions || {}).forEach(
            ([maturity, questions]) => {
              if (getBehaviourMaturityIndex(maturity) === -1) {
                errors.push(
                  createError(
                    "INVALID_VALUE",
                    `Question bank has invalid behaviour maturity: ${maturity}`,
                    `questionBank.behaviourMaturities.${behaviourId}.${roleType}.${maturity}`,
                    maturity,
                  ),
                );
              }
              if (!Array.isArray(questions) || questions.length === 0) {
                warnings.push(
                  createWarning(
                    "EMPTY_QUESTIONS",
                    `No questions for behaviour ${behaviourId} (${roleType}) at maturity ${maturity}`,
                    `questionBank.behaviourMaturities.${behaviourId}.${roleType}.${maturity}`,
                  ),
                );
              }
            },
          );
        },
      );
    },
  );

  return errors;
}
