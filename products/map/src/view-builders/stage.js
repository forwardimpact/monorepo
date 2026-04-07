/**
 * View builder for stage entities.
 */

import { stageIri } from "../iri.js";

/**
 * @param {object} stage - Raw stage entity
 * @param {number} [position] - Optional ordinal position from the source array
 * @returns {object}
 */
export function buildStageView(stage, position = 0) {
  return {
    iri: stageIri(stage.id),
    id: stage.id,
    name: stage.name,
    summary: stage.summary || null,
    description: stage.description || "",
    position,
    constraints: stage.constraints || [],
  };
}
