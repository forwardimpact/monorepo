import { createError } from "./common.js";
import { isCapability } from "../modifiers.js";
import { validateAgentIdentitySection } from "./agent-section.js";

function validateTrackSkillModifiers(track, path) {
  const errors = [];

  if (!track.skillModifiers) return errors;

  Object.entries(track.skillModifiers).forEach(([key, modifier]) => {
    if (!isCapability(key)) {
      errors.push(
        createError(
          "INVALID_SKILL_MODIFIER_KEY",
          `Track "${track.id}" has invalid skillModifier key "${key}". Only capability names are allowed: delivery, data, ai, scale, reliability, people, process, business, documentation`,
          `${path}.skillModifiers.${key}`,
          key,
        ),
      );
    }
    if (typeof modifier !== "number" || !Number.isInteger(modifier)) {
      errors.push(
        createError(
          "INVALID_VALUE",
          `Track "${track.id}" has invalid skill modifier: ${modifier} (must be an integer)`,
          `${path}.skillModifiers.${key}`,
          modifier,
        ),
      );
    }
  });

  return errors;
}

function validateTrackBehaviourModifiers(track, path, behaviourIds) {
  const errors = [];

  if (!track.behaviourModifiers) return errors;

  Object.entries(track.behaviourModifiers).forEach(
    ([behaviourId, modifier]) => {
      if (!behaviourIds.has(behaviourId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Track "${track.id}" references non-existent behaviour: ${behaviourId}`,
            `${path}.behaviourModifiers.${behaviourId}`,
            behaviourId,
          ),
        );
      }
      if (typeof modifier !== "number" || !Number.isInteger(modifier)) {
        errors.push(
          createError(
            "INVALID_VALUE",
            `Track "${track.id}" has invalid behaviour modifier: ${modifier} (must be an integer)`,
            `${path}.behaviourModifiers.${behaviourId}`,
            modifier,
          ),
        );
      }
    },
  );

  return errors;
}

function validateTrackAssessmentWeights(track, path) {
  const errors = [];

  if (!track.assessmentWeights) return errors;

  const { skillWeight, behaviourWeight } = track.assessmentWeights;
  if (typeof skillWeight !== "number" || skillWeight < 0 || skillWeight > 1) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Track "${track.id}" has invalid assessmentWeights.skillWeight: ${skillWeight}`,
        `${path}.assessmentWeights.skillWeight`,
        skillWeight,
      ),
    );
  }
  if (
    typeof behaviourWeight !== "number" ||
    behaviourWeight < 0 ||
    behaviourWeight > 1
  ) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Track "${track.id}" has invalid assessmentWeights.behaviourWeight: ${behaviourWeight}`,
        `${path}.assessmentWeights.behaviourWeight`,
        behaviourWeight,
      ),
    );
  }
  if (typeof skillWeight === "number" && typeof behaviourWeight === "number") {
    const sum = skillWeight + behaviourWeight;
    if (Math.abs(sum - 1.0) > 0.001) {
      errors.push(
        createError(
          "INVALID_VALUE",
          `Track "${track.id}" assessmentWeights must sum to 1.0 (got ${sum})`,
          `${path}.assessmentWeights`,
          { skillWeight, behaviourWeight },
        ),
      );
    }
  }

  return errors;
}

/**
 * @param {import('../levels.js').Track} track
 * @param {number} index
 * @param {Set<string>} disciplineSkillIds
 * @param {Set<string>} behaviourIds
 * @param {Set<string>} levelIds
 * @returns {{errors: Array, warnings: Array}}
 */
export function validateTrack(
  track,
  index,
  disciplineSkillIds,
  behaviourIds,
  levelIds,
) {
  const errors = [];
  const warnings = [];
  const path = `tracks[${index}]`;

  if (!track.name) {
    errors.push(
      createError("MISSING_REQUIRED", "Track missing name", `${path}.name`),
    );
  }

  errors.push(...validateTrackSkillModifiers(track, path));
  errors.push(...validateTrackBehaviourModifiers(track, path, behaviourIds));

  if (track.minLevel && !levelIds.has(track.minLevel)) {
    errors.push(
      createError(
        "INVALID_REFERENCE",
        `Track "${track.id}" references non-existent level: ${track.minLevel}`,
        `${path}.minLevel`,
        track.minLevel,
      ),
    );
  }

  errors.push(...validateTrackAssessmentWeights(track, path));

  if (track.agent) {
    errors.push(
      ...validateAgentIdentitySection(track.agent, `${path}.agent`, "Track"),
    );
  }

  return { errors, warnings };
}
