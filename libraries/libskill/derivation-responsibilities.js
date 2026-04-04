/**
 * Job Responsibility Derivation
 *
 * Pure functions for deriving role responsibilities from skill matrices
 * and capability definitions. Extracted from derivation.js for max-lines compliance.
 */

import { SKILL_PROFICIENCY_ORDER } from "@forwardimpact/map/levels";

/**
 * Build a map of capability ID to maximum skill proficiency
 * @param {import('./levels.js').SkillMatrixEntry[]} skillMatrix - Derived skill matrix
 * @returns {Map<string, string>} Map of capability ID to max proficiency
 */
function buildCapabilityProficiencyMap(skillMatrix) {
  const map = new Map();
  for (const skill of skillMatrix) {
    const currentProficiency = map.get(skill.capability);
    const skillIndex = SKILL_PROFICIENCY_ORDER.indexOf(skill.proficiency);
    const currentIndex = currentProficiency
      ? SKILL_PROFICIENCY_ORDER.indexOf(currentProficiency)
      : -1;
    if (skillIndex > currentIndex) {
      map.set(skill.capability, skill.proficiency);
    }
  }
  return map;
}

/**
 * Count skills per capability at the capability's max proficiency
 * @param {import('./levels.js').SkillMatrixEntry[]} skillMatrix - Derived skill matrix
 * @param {Map<string, string>} capabilityProficiencies - Max proficiency per capability
 * @returns {Map<string, number>} Map of capability ID to skill count at max proficiency
 */
function countSkillsAtMaxProficiency(skillMatrix, capabilityProficiencies) {
  const counts = new Map();
  for (const skill of skillMatrix) {
    const capMaxProf = capabilityProficiencies.get(skill.capability);
    if (skill.proficiency === capMaxProf) {
      const count = counts.get(skill.capability) || 0;
      counts.set(skill.capability, count + 1);
    }
  }
  return counts;
}

/**
 * Derive role responsibilities from skill matrix and capabilities
 *
 * Responsibilities are determined by finding the maximum skill proficiency
 * achieved in each capability, then looking up the corresponding
 * responsibility statement from the capability definition.
 *
 * @param {Object} params
 * @param {import('./levels.js').SkillMatrixEntry[]} params.skillMatrix - Derived skill matrix for the job
 * @param {Object[]} params.capabilities - Capability definitions with responsibilities
 * @param {import('./levels.js').Discipline} params.discipline - The discipline (determines which responsibilities to use)
 * @returns {Array<{capability: string, capabilityName: string, emojiIcon: string, responsibility: string, level: string}>}
 */
export function deriveResponsibilities({
  skillMatrix,
  capabilities,
  discipline,
}) {
  if (!capabilities || capabilities.length === 0) {
    return [];
  }

  const responsibilityKey = discipline?.isManagement
    ? "managementResponsibilities"
    : "professionalResponsibilities";

  const capabilityProficiencies = buildCapabilityProficiencyMap(skillMatrix);
  const capabilitySkillCounts = countSkillsAtMaxProficiency(
    skillMatrix,
    capabilityProficiencies,
  );
  const capabilityMap = new Map(capabilities.map((c) => [c.id, c]));

  const responsibilities = [];

  for (const [capabilityId, proficiency] of capabilityProficiencies) {
    if (proficiency === "awareness") continue;

    const capability = capabilityMap.get(capabilityId);
    const responsibilityText = capability?.[responsibilityKey]?.[proficiency];
    if (responsibilityText) {
      responsibilities.push({
        capability: capabilityId,
        capabilityName: capability.name,
        emojiIcon: capability.emojiIcon || "\u{1F4A1}",
        ordinalRank: capability.ordinalRank ?? 999,
        responsibility: responsibilityText,
        proficiency,
        proficiencyIndex: SKILL_PROFICIENCY_ORDER.indexOf(proficiency),
        skillCount: capabilitySkillCounts.get(capabilityId) || 0,
      });
    }
  }

  responsibilities.sort((a, b) => {
    if (b.proficiencyIndex !== a.proficiencyIndex) {
      return b.proficiencyIndex - a.proficiencyIndex;
    }
    if (b.skillCount !== a.skillCount) {
      return b.skillCount - a.skillCount;
    }
    return a.ordinalRank - b.ordinalRank;
  });

  return responsibilities.map(
    ({
      proficiencyIndex: _proficiencyIndex,
      skillCount: _skillCount,
      ...rest
    }) => rest,
  );
}
