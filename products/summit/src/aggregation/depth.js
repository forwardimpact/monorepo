/**
 * Proficiency-threshold helpers shared across aggregation, risk,
 * what-if, growth, and evidence code paths.
 *
 * The "working+" threshold is the canonical depth decision in Summit —
 * this module encapsulates it so future refactors touch one place.
 */

import {
  SkillProficiency,
  skillProficiencyMeetsRequirement,
} from "@forwardimpact/libskill/levels";

/**
 * Is a proficiency at working level or above?
 *
 * @param {string} proficiency
 * @returns {boolean}
 */
export function meetsWorking(proficiency) {
  if (!proficiency) return false;
  return skillProficiencyMeetsRequirement(
    proficiency,
    SkillProficiency.WORKING,
  );
}

/**
 * Sum allocations for every holder at working+ proficiency.
 *
 * @param {Array<{ proficiency: string, allocation: number }>} holders
 * @returns {number}
 */
export function computeEffectiveDepth(holders) {
  return holders
    .filter((h) => meetsWorking(h.proficiency))
    .reduce((sum, h) => sum + (h.allocation ?? 1.0), 0);
}
