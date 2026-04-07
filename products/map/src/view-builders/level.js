/**
 * View builder for level entities.
 */

import { levelIri } from "../iri.js";

/**
 * @param {object} level - Raw level entity (from levels.yaml)
 * @returns {object}
 */
export function buildLevelView(level) {
  return {
    iri: levelIri(level.id),
    id: level.id,
    name: level.professionalTitle || level.managementTitle || level.id,
    shortName: level.shortName || null,
    description: level.qualificationSummary || "",
    position: level.ordinalRank ?? 0,
    typicalExperienceRange: level.typicalExperienceRange || null,
  };
}
